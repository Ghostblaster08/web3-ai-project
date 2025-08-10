require("dotenv").config();
const { ethers } = require("ethers");
const fs = require('fs');
const axios = require('axios');

const LENDING_POOL_ADDRESS = "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9";

const LENDING_POOL_ABI = [
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralETH,uint256 totalDebtETH,uint256 availableBorrowsETH,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)"
];

class TrulyDynamicWalletFinder {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_URL);
    this.lendingPool = new ethers.Contract(LENDING_POOL_ADDRESS, LENDING_POOL_ABI, this.provider);
    this.apiKey = process.env.API_KEY;
    this.foundAddresses = new Set();
    this.checkedCount = 0;
    this.activeCount = 0;
  }

  async findAddressesFromRecentBlocks() {
    console.log("🔍 Method 1: Scanning recent blocks for ALL unique addresses...");
    
    try {
      const latestBlock = await this.provider.getBlockNumber();
      const addressSet = new Set();
      
      // Scan more recent blocks to get more current addresses
      for (let i = 0; i < 100; i++) {
        const blockNumber = latestBlock - i;
        const block = await this.provider.getBlock(blockNumber, true);
        
        if (block && block.transactions) {
          block.transactions.forEach(tx => {
            if (tx.from) addressSet.add(tx.from);
            if (tx.to) addressSet.add(tx.to);
          });
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
        
        if (i % 20 === 0) {
          console.log(`   Scanned ${i + 1}/100 blocks, found ${addressSet.size} unique addresses`);
        }
      }
      
      // Filter out zero address and add to our collection
      addressSet.forEach(addr => {
        if (addr && addr !== '0x0000000000000000000000000000000000000000') {
          this.foundAddresses.add(addr);
        }
      });
      
      console.log(`   ✅ Found ${addressSet.size} unique addresses from recent blocks`);
    } catch (error) {
      console.log(`   ❌ Error in block scanning: ${error.message}`);
    }
  }

  async findAddressesFromEtherscanRecent() {
    console.log("🔍 Method 2: Getting recent transactions from Etherscan...");
    
    try {
      // Get recent transactions from the entire network (no specific address)
      const response = await axios.get('https://api.etherscan.io/api', {
        params: {
          module: 'proxy',
          action: 'eth_getBlockByNumber',
          tag: 'latest',
          boolean: true,
          apikey: this.apiKey
        }
      });
      
      if (response.data && response.data.result && response.data.result.transactions) {
        const addresses = new Set();
        
        response.data.result.transactions.forEach(tx => {
          if (tx.from) addresses.add(tx.from);
          if (tx.to) addresses.add(tx.to);
        });
        
        addresses.forEach(addr => {
          if (addr && addr !== '0x0000000000000000000000000000000000000000') {
            this.foundAddresses.add(addr);
          }
        });
        
        console.log(`   ✅ Found ${addresses.size} addresses from latest block`);
      }
    } catch (error) {
      console.log(`   ❌ Error in Etherscan method: ${error.message}`);
    }
  }

  async findAddressesFromMempool() {
    console.log("🔍 Method 3: Getting addresses from pending transactions...");
    
    try {
      // Get pending transactions
      const pendingBlock = await this.provider.send("eth_getBlockByNumber", ["pending", true]);
      
      if (pendingBlock && pendingBlock.transactions) {
        const addresses = new Set();
        
        pendingBlock.transactions.slice(0, 200).forEach(tx => { // Limit to avoid too many
          if (tx.from) addresses.add(tx.from);
          if (tx.to) addresses.add(tx.to);
        });
        
        addresses.forEach(addr => {
          if (addr && addr !== '0x0000000000000000000000000000000000000000') {
            this.foundAddresses.add(addr);
          }
        });
        
        console.log(`   ✅ Found ${addresses.size} addresses from pending transactions`);
      }
    } catch (error) {
      console.log(`   ❌ Error in mempool method: ${error.message}`);
    }
  }

  async findAddressesFromRandomSampling() {
    console.log("🔍 Method 4: Random sampling from transaction history...");
    
    try {
      const latestBlock = await this.provider.getBlockNumber();
      const addresses = new Set();
      
      // Sample 20 random blocks from the last 10000 blocks
      for (let i = 0; i < 20; i++) {
        const randomOffset = Math.floor(Math.random() * 10000);
        const blockNumber = latestBlock - randomOffset;
        
        const block = await this.provider.getBlock(blockNumber, true);
        
        if (block && block.transactions) {
          // Take first 10 transactions from each sampled block
          block.transactions.slice(0, 10).forEach(tx => {
            if (tx.from) addresses.add(tx.from);
            if (tx.to) addresses.add(tx.to);
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      addresses.forEach(addr => {
        if (addr && addr !== '0x0000000000000000000000000000000000000000') {
          this.foundAddresses.add(addr);
        }
      });
      
      console.log(`   ✅ Found ${addresses.size} addresses from random sampling`);
    } catch (error) {
      console.log(`   ❌ Error in random sampling: ${error.message}`);
    }
  }

  async discoverAddresses() {
    console.log("🚀 Starting TRULY dynamic address discovery (no hardcoded addresses)...\n");
    
    const methods = [
      () => this.findAddressesFromRecentBlocks(),
      () => this.findAddressesFromEtherscanRecent(),
      () => this.findAddressesFromMempool(),
      () => this.findAddressesFromRandomSampling()
    ];

    for (const method of methods) {
      try {
        await method();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting between methods
      } catch (error) {
        console.log(`Method failed: ${error.message}`);
      }
    }

    console.log(`\n🎯 Total unique addresses discovered: ${this.foundAddresses.size}`);
    return Array.from(this.foundAddresses);
  }

  async analyzeWallet(address) {
    try {
      this.checkedCount++;
      
      // Skip the Aave contract itself
      if (address.toLowerCase() === LENDING_POOL_ADDRESS.toLowerCase()) {
        return null;
      }

      if (this.checkedCount % 50 === 0) {
        console.log(`📊 Progress: Checked ${this.checkedCount} addresses, found ${this.activeCount} active Aave users`);
      }
      
      const accountData = await this.lendingPool.getUserAccountData(address);
      const totalCollateral = Number(ethers.formatEther(accountData.totalCollateralETH));
      const totalDebt = Number(ethers.formatEther(accountData.totalDebtETH));
      const healthFactor = Number(ethers.formatEther(accountData.healthFactor));
      
      // Only include wallets with BOTH collateral AND debt (active borrowers)
      if (totalCollateral === 0 || totalDebt === 0) {
        return null;
      }

      // Minimum thresholds to filter out dust
      if (totalCollateral < 0.01 || totalDebt < 0.001) {
        return null;
      }
      
      this.activeCount++;
      console.log(`   ✅ ACTIVE BORROWER #${this.activeCount}: ${address}`);
      console.log(`      Collateral: ${totalCollateral.toFixed(4)} ETH, Debt: ${totalDebt.toFixed(4)} ETH`);
      
      const transactions = await this.getTransactions(address);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const portfolioDiversity = this.calculatePortfolioDiversity(transactions);
      const accountAge = this.calculateAccountAge(transactions);
      const activityFrequency = this.calculateActivityFrequency(transactions);
      
      const repaymentRatio = totalDebt > 0 ? (totalCollateral / totalDebt) : 0;
      const liquidationRatio = healthFactor;
      
      return {
        address: address,
        repayment_ratio: repaymentRatio.toFixed(4),
        liquidation_ratio: liquidationRatio.toFixed(4),
        total_borrowed: totalDebt.toFixed(6),
        portfolio_diversity: portfolioDiversity.diversityScore.toFixed(4),
        account_age_days: accountAge,
        activity_frequency: activityFrequency.toFixed(6),
        total_collateral: totalCollateral.toFixed(6),
        unique_tokens: portfolioDiversity.uniqueTokens,
        total_transactions: transactions.length
      };
      
    } catch (error) {
      // Silently skip errors to avoid spam
      return null;
    }
  }

  async getTransactions(address) {
    try {
      const response = await axios.get(`https://api.etherscan.io/api`, {
        params: {
          module: 'account',
          action: 'txlist',
          address: address,
          startblock: 0,
          endblock: 99999999,
          sort: 'asc',
          apikey: this.apiKey
        }
      });
      
      return response.data.status === "1" ? response.data.result : [];
    } catch (error) {
      return [];
    }
  }

  calculatePortfolioDiversity(transactions) {
    const tokenCounts = {};
    transactions.forEach(tx => {
      const value = parseFloat(tx.value);
      if (value > 0) {
        tokenCounts['ETH'] = (tokenCounts['ETH'] || 0) + value;
      }
      if (tx.functionName && tx.functionName.includes('transfer')) {
        tokenCounts[tx.to] = (tokenCounts[tx.to] || 0) + 1;
      }
    });
    
    const uniqueTokens = Object.keys(tokenCounts).length;
    const totalValue = Object.values(tokenCounts).reduce((a, b) => a + b, 0);
    const hhi = totalValue > 0 ? Object.values(tokenCounts).reduce((sum, value) => sum + Math.pow(value/totalValue, 2), 0) : 0;
    const diversityScore = totalValue > 0 ? 1 - hhi : 0;
    
    return { diversityScore, uniqueTokens };
  }

  calculateAccountAge(transactions) {
    if (transactions.length === 0) return 0;
    const timestamps = transactions.map(tx => parseInt(tx.timeStamp) * 1000);
    const firstTx = new Date(Math.min(...timestamps));
    return Math.floor((Date.now() - firstTx.getTime()) / (1000 * 60 * 60 * 24));
  }

  calculateActivityFrequency(transactions) {
    if (transactions.length === 0) return 0;
    const totalDays = this.calculateAccountAge(transactions);
    return totalDays > 0 ? transactions.length / totalDays : 0;
  }

  async generateTrulyDynamicCSV() {
    // Step 1: Discover addresses dynamically (NO hardcoding)
    const discoveredAddresses = await this.discoverAddresses();
    
    if (discoveredAddresses.length === 0) {
      console.log("❌ No addresses discovered. Check your network connection.");
      return;
    }
    
    console.log(`\n🎯 Starting analysis of ${discoveredAddresses.length} discovered addresses...`);
    console.log("⏱️  This may take a while as we're checking each address for Aave activity...\n");
    
    // Step 2: Analyze each discovered address
    const results = [];
    
    // Limit to reasonable number to avoid rate limits and long execution
    const maxToCheck = Math.min(discoveredAddresses.length, 500);
    
    for (let i = 0; i < maxToCheck; i++) {
      const wallet = discoveredAddresses[i];
      
      const metrics = await this.analyzeWallet(wallet);
      if (metrics) {
        results.push(metrics);
      }
      
      // Stop if we found enough active users
      if (results.length >= 20) {
        console.log(`\n🎯 Found 20 active borrowers, stopping search...`);
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    console.log(`\n📊 FINAL RESULTS:`);
    console.log(`   Total addresses checked: ${this.checkedCount}`);
    console.log(`   Active borrowers found: ${this.activeCount}`);
    console.log(`   Success rate: ${((this.activeCount / this.checkedCount) * 100).toFixed(4)}%`);

    if (results.length === 0) {
      console.log("❌ No active borrowers found in discovered addresses.");
      console.log("   This suggests that active Aave borrowers are quite rare in random sampling.");
      return;
    }

    // Step 3: Generate CSV
    const csvHeaders = [
      'address', 'repayment_ratio', 'liquidation_ratio', 'total_borrowed',
      'portfolio_diversity', 'account_age_days', 'activity_frequency',
      'total_collateral', 'unique_tokens', 'total_transactions'
    ];

    let csvContent = csvHeaders.join(',') + '\n';
    results.forEach(row => {
      const csvRow = csvHeaders.map(header => row[header]).join(',');
      csvContent += csvRow + '\n';
    });

    const filename = `truly_dynamic_${new Date().toISOString().split('T')[0]}.csv`;
    fs.writeFileSync(filename, csvContent);
    
    console.log(`\n💾 CSV saved: ${filename}`);
    console.log(`📈 Active borrowers in CSV: ${results.length}`);
    
    return filename;
  }
}

async function main() {
  const finder = new TrulyDynamicWalletFinder();
  await finder.generateTrulyDynamicCSV();
}

main().catch(console.error);