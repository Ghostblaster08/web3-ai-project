require("dotenv").config();
const { ethers } = require("ethers");
const fs = require('fs');
const axios = require('axios');

const LENDING_POOL_ADDRESS = "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9";

const LENDING_POOL_ABI = [
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralETH,uint256 totalDebtETH,uint256 availableBorrowsETH,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)"
];

class EtherscanActiveWalletFinder {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_URL);
    this.lendingPool = new ethers.Contract(LENDING_POOL_ADDRESS, LENDING_POOL_ABI, this.provider);
    this.apiKey = process.env.API_KEY;
    this.foundAddresses = new Set();
    this.checkedCount = 0;
    this.activeCount = 0;
  }

  async fetchActiveAccountsFromEtherscan() {
    console.log("🔍 Fetching active accounts from Etherscan recent transactions...\n");
    
    try {
      // Method 1: Get latest transactions using Etherscan API (multiple pages)
      const addresses = new Set();
      
      for (let page = 1; page <= 5; page++) {
        console.log(`   📄 Fetching page ${page} of recent transactions...`);
        
        // Get latest block number first
        const latestBlockResponse = await axios.get('https://api.etherscan.io/api', {
          params: {
            module: 'proxy',
            action: 'eth_blockNumber',
            apikey: this.apiKey
          }
        });
        
        if (latestBlockResponse.data && latestBlockResponse.data.result) {
          const latestBlock = parseInt(latestBlockResponse.data.result, 16);
          const fromBlock = latestBlock - (page * 100); // Get different ranges
          
          // Get transactions from recent blocks
          const txResponse = await axios.get('https://api.etherscan.io/api', {
            params: {
              module: 'account',
              action: 'txlist',
              startblock: fromBlock,
              endblock: latestBlock,
              sort: 'desc',
              apikey: this.apiKey
            }
          });
          
          if (txResponse.data && txResponse.data.status === "1") {
            txResponse.data.result.slice(0, 100).forEach(tx => {
              if (tx.from) addresses.add(tx.from);
              if (tx.to) addresses.add(tx.to);
            });
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log(`   ✅ Found ${addresses.size} unique addresses from recent transactions`);
      
      // Method 2: Get transactions from high-activity blocks
      await this.fetchFromHighActivityBlocks(addresses);
      
      // Method 3: Get addresses from token transfers (active DeFi users)
      await this.fetchFromTokenTransfers(addresses);
      
      // Add all addresses to our set
      addresses.forEach(addr => {
        if (addr && 
            addr !== '0x0000000000000000000000000000000000000000' &&
            addr.toLowerCase() !== LENDING_POOL_ADDRESS.toLowerCase()) {
          this.foundAddresses.add(addr);
        }
      });
      
      console.log(`\n🎯 Total unique active addresses collected: ${this.foundAddresses.size}`);
      return Array.from(this.foundAddresses);
      
    } catch (error) {
      console.log(`❌ Error fetching from Etherscan: ${error.message}`);
      return [];
    }
  }

  async fetchFromHighActivityBlocks(addresses) {
    console.log("   🔥 Fetching from high-activity blocks...");
    
    try {
      // Get latest block and scan back for high-transaction blocks
      const latestBlockResponse = await axios.get('https://api.etherscan.io/api', {
        params: {
          module: 'proxy',
          action: 'eth_blockNumber',
          apikey: this.apiKey
        }
      });
      
      if (latestBlockResponse.data && latestBlockResponse.data.result) {
        const latestBlock = parseInt(latestBlockResponse.data.result, 16);
        
        // Check last 20 blocks for high activity
        for (let i = 0; i < 20; i++) {
          const blockNumber = latestBlock - i;
          
          const blockResponse = await axios.get('https://api.etherscan.io/api', {
            params: {
              module: 'proxy',
              action: 'eth_getBlockByNumber',
              tag: `0x${blockNumber.toString(16)}`,
              boolean: true,
              apikey: this.apiKey
            }
          });
          
          if (blockResponse.data && blockResponse.data.result && blockResponse.data.result.transactions) {
            const transactions = blockResponse.data.result.transactions;
            
            // Only process blocks with high transaction count (more likely to have DeFi activity)
            if (transactions.length > 50) {
              transactions.forEach(tx => {
                if (tx.from) addresses.add(tx.from);
                if (tx.to) addresses.add(tx.to);
              });
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      console.log(`      Added addresses from high-activity blocks`);
    } catch (error) {
      console.log(`      Error in high-activity blocks: ${error.message}`);
    }
  }

  async fetchFromTokenTransfers(addresses) {
    console.log("   🪙 Fetching from recent token transfers...");
    
    try {
      // Get recent ERC-20 token transfers (more likely to be active DeFi users)
      const tokenResponse = await axios.get('https://api.etherscan.io/api', {
        params: {
          module: 'logs',
          action: 'getLogs',
          fromBlock: 'latest',
          toBlock: 'latest',
          topic0: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer event signature
          apikey: this.apiKey
        }
      });
      
      if (tokenResponse.data && tokenResponse.data.status === "1") {
        tokenResponse.data.result.slice(0, 200).forEach(log => {
          if (log.topics && log.topics.length >= 3) {
            // Extract from and to addresses from Transfer event topics
            const fromAddr = '0x' + log.topics[1].slice(26); // Remove padding
            const toAddr = '0x' + log.topics[2].slice(26);   // Remove padding
            
            addresses.add(fromAddr);
            addresses.add(toAddr);
          }
        });
      }
      
      console.log(`      Added addresses from token transfers`);
    } catch (error) {
      console.log(`      Error in token transfers: ${error.message}`);
    }
  }

  async analyzeWallet(address) {
    try {
      this.checkedCount++;
      
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

  async generateCSVFromActiveAccounts() {
    console.log("🚀 Generating CSV from Etherscan's most active accounts...\n");
    
    // Step 1: Get active addresses from Etherscan
    const activeAddresses = await this.fetchActiveAccountsFromEtherscan();
    
    if (activeAddresses.length === 0) {
      console.log("❌ No active addresses found. Check your API key and connection.");
      return;
    }
    
    console.log(`\n🎯 Starting analysis of ${activeAddresses.length} active addresses...`);
    console.log("⏱️  Checking each address for Aave borrowing activity...\n");
    
    // Step 2: Analyze each active address for Aave activity
    const results = [];
    const maxToCheck = Math.min(activeAddresses.length, 1000); // Check up to 1000 addresses
    
    for (let i = 0; i < maxToCheck; i++) {
      const wallet = activeAddresses[i];
      
      const metrics = await this.analyzeWallet(wallet);
      if (metrics) {
        results.push(metrics);
      }
      
      // Stop if we found enough active users
      if (results.length >= 30) {
        console.log(`\n🎯 Found 30 active borrowers, stopping search...`);
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100)); // Faster since we have better targets
    }

    console.log(`\n📊 FINAL RESULTS:`);
    console.log(`   Total active addresses checked: ${this.checkedCount}`);
    console.log(`   Active Aave borrowers found: ${this.activeCount}`);
    console.log(`   Success rate: ${((this.activeCount / this.checkedCount) * 100).toFixed(4)}%`);

    if (results.length === 0) {
      console.log("❌ No active borrowers found in the active addresses.");
      console.log("   This shows how rare active DeFi borrowing actually is!");
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

    const filename = `etherscan_active_borrowers_${new Date().toISOString().split('T')[0]}.csv`;
    fs.writeFileSync(filename, csvContent);
    
    console.log(`\n💾 CSV saved: ${filename}`);
    console.log(`📈 Active borrowers in CSV: ${results.length}`);
    
    // Show sample of results
    if (results.length > 0) {
      console.log(`\n📋 Sample results:`);
      results.slice(0, 3).forEach((result, i) => {
        console.log(`${i + 1}. ${result.address}`);
        console.log(`   Collateral: ${result.total_collateral} ETH`);
        console.log(`   Debt: ${result.total_borrowed} ETH`);
        console.log(`   Health Factor: ${result.liquidation_ratio}`);
      });
    }
    
    return filename;
  }
}

async function main() {
  const finder = new EtherscanActiveWalletFinder();
  await finder.generateCSVFromActiveAccounts();
}

main().catch(console.error);