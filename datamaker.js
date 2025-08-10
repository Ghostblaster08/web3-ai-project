require("dotenv").config();
const { ethers } = require("ethers");
const fs = require('fs');
const axios = require('axios');

// Aave v2 LendingPool contract (Ethereum mainnet)
const LENDING_POOL_ADDRESS = "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9";

// ABIs
const LENDING_POOL_ABI = [
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralETH,uint256 totalDebtETH,uint256 availableBorrowsETH,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)"
];

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

class DynamicWalletFinder {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_URL);
    this.lendingPool = new ethers.Contract(LENDING_POOL_ADDRESS, LENDING_POOL_ABI, this.provider);
    this.apiKey = process.env.API_KEY;
    this.foundAddresses = new Set();
  }

  async findActiveAaveUsers() {
    console.log("🔍 Dynamically finding active Aave users...\n");
    
    const methods = [
      () => this.findFromAaveEvents(),
      () => this.findFromRecentBlocks(),
      () => this.findFromTokenTransfers(),
      () => this.findFromEtherscanAPI()
    ];

    for (const method of methods) {
      try {
        await method();
      } catch (error) {
        console.log(`Method failed: ${error.message}`);
      }
    }

    return Array.from(this.foundAddresses);
  }

  async findFromAaveEvents() {
    console.log("📊 Method 1: Finding users from Aave contract events...");
    
    try {
      // Get recent blocks to search for Aave interactions
      const latestBlock = await this.provider.getBlockNumber();
      const fromBlock = latestBlock - 1000; // Last ~1000 blocks
      
      // This is a simplified approach - in reality you'd need the full Aave ABI
      // to get deposit/borrow events, but we'll use transaction data instead
      const aaveTransactions = await this.getRecentTransactions(LENDING_POOL_ADDRESS, fromBlock);
      
      aaveTransactions.forEach(tx => {
        if (tx.from && tx.from !== '0x0000000000000000000000000000000000000000') {
          this.foundAddresses.add(tx.from);
        }
        if (tx.to && tx.to !== '0x0000000000000000000000000000000000000000') {
          this.foundAddresses.add(tx.to);
        }
      });
      
      console.log(`   Found ${aaveTransactions.length} recent Aave interactions`);
    } catch (error) {
      console.log(`   Error in Aave events method: ${error.message}`);
    }
  }

  async findFromRecentBlocks() {
    console.log("📊 Method 2: Scanning recent blocks for high-value transactions...");
    
    try {
      const latestBlock = await this.provider.getBlockNumber();
      const addresses = new Set();
      
      // Scan last 50 blocks for high-value transactions (likely whales/institutions)
      for (let i = 0; i < 50; i++) {
        const blockNumber = latestBlock - i;
        const block = await this.provider.getBlock(blockNumber, true);
        
        if (block && block.transactions) {
          block.transactions.forEach(tx => {
            const value = parseFloat(ethers.formatEther(tx.value || 0));
            // Look for transactions > 10 ETH (more likely to be DeFi users)
            if (value > 10) {
              addresses.add(tx.from);
              addresses.add(tx.to);
            }
          });
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Add unique addresses
      addresses.forEach(addr => {
        if (addr && addr !== '0x0000000000000000000000000000000000000000') {
          this.foundAddresses.add(addr);
        }
      });
      
      console.log(`   Found ${addresses.size} high-value transaction addresses`);
    } catch (error) {
      console.log(`   Error in recent blocks method: ${error.message}`);
    }
  }

  async findFromTokenTransfers() {
    console.log("📊 Method 3: Finding addresses from major DeFi token transfers...");
    
    // Major DeFi tokens - holders are likely to use Aave
    const defiTokens = [
      "0xA0b86a33E6417c4C7cA0C03db1EC0Bf4e6431E66", // UNI
      "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", // AAVE
      "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
      "0xA0b73E1Ff0B80914AB6fe0444E65848C4C34450b", // CRO
    ];

    try {
      for (const tokenAddress of defiTokens) {
        const transfers = await this.getRecentTokenTransfers(tokenAddress);
        transfers.forEach(transfer => {
          this.foundAddresses.add(transfer.from);
          this.foundAddresses.add(transfer.to);
        });
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log(`   Found addresses from DeFi token transfers`);
    } catch (error) {
      console.log(`   Error in token transfers method: ${error.message}`);
    }
  }

  async findFromEtherscanAPI() {
    console.log("📊 Method 4: Using Etherscan API to find DeFi users...");
    
    try {
      // Get top ETH holders (more likely to use DeFi)
      const response = await axios.get(`https://api.etherscan.io/api`, {
        params: {
          module: 'account',
          action: 'balancemulti',
          address: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8,0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503,0x742d35Cc6486C9A6B6f53df8e511731C6A96e671',
          tag: 'latest',
          apikey: this.apiKey
        }
      });
      
      if (response.data.status === "1") {
        response.data.result.forEach(account => {
          const balance = parseFloat(ethers.formatEther(account.balance));
          if (balance > 100) { // High balance holders
            this.foundAddresses.add(account.account);
          }
        });
      }
      
      console.log(`   Checked high-balance accounts`);
    } catch (error) {
      console.log(`   Error in Etherscan API method: ${error.message}`);
    }
  }

  async getRecentTransactions(contractAddress, fromBlock) {
    try {
      const response = await axios.get('https://api.etherscan.io/api', {
        params: {
          module: 'account',
          action: 'txlist',
          address: contractAddress,
          startblock: fromBlock,
          endblock: 'latest',
          sort: 'desc',
          apikey: this.apiKey
        }
      });
      
      return response.data.status === "1" ? response.data.result.slice(0, 100) : [];
    } catch (error) {
      return [];
    }
  }

  async getRecentTokenTransfers(tokenAddress) {
    try {
      const response = await axios.get('https://api.etherscan.io/api', {
        params: {
          module: 'account',
          action: 'tokentx',
          contractaddress: tokenAddress,
          sort: 'desc',
          apikey: this.apiKey
        }
      });
      
      return response.data.status === "1" ? response.data.result.slice(0, 50) : [];
    } catch (error) {
      return [];
    }
  }

  async getTransactions(address) {
    try {
      const url = `https://api.etherscan.io/api`;
      const params = {
        module: 'account',
        action: 'txlist',
        address: address,
        startblock: 0,
        endblock: 99999999,
        sort: 'asc',
        apikey: this.apiKey
      };

      const response = await axios.get(url, { params });
      
      if (response.data.status === "1") {
        return response.data.result;
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  calculatePortfolioDiversity(transactions) {
    const tokenCounts = {};
    let ethTotal = 0;
    
    transactions.forEach(tx => {
      const value = parseFloat(tx.value);
      if (value > 0) {
        ethTotal += value;
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
    
    return {
      diversityScore: diversityScore,
      uniqueTokens: uniqueTokens
    };
  }

  calculateAccountAge(transactions) {
    if (transactions.length === 0) return 0;
    
    const timestamps = transactions.map(tx => parseInt(tx.timeStamp) * 1000);
    const firstTx = new Date(Math.min(...timestamps));
    const accountAge = Math.floor((Date.now() - firstTx.getTime()) / (1000 * 60 * 60 * 24));
    
    return accountAge;
  }

  calculateActivityFrequency(transactions) {
    if (transactions.length === 0) return 0;
    
    const dates = transactions.map(tx => new Date(parseInt(tx.timeStamp) * 1000).toDateString());
    const uniqueDays = new Set(dates).size;
    const totalDays = this.calculateAccountAge(transactions);
    
    return totalDays > 0 ? transactions.length / totalDays : 0;
  }

  async analyzeWallet(address) {
    try {
      console.log(`📊 Analyzing: ${address}`);
      
      const accountData = await this.lendingPool.getUserAccountData(address);
      const totalCollateral = Number(ethers.formatEther(accountData.totalCollateralETH));
      const totalDebt = Number(ethers.formatEther(accountData.totalDebtETH));
      const healthFactor = Number(ethers.formatEther(accountData.healthFactor));
      
      if (totalCollateral === 0 && totalDebt === 0) {
        console.log(`   ❌ No Aave activity`);
        return null;
      }
      
      console.log(`   ✅ Active Aave user - Collateral: ${totalCollateral.toFixed(4)} ETH, Debt: ${totalDebt.toFixed(4)} ETH`);
      
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
      console.log(`   ⚠️  Error analyzing ${address}: ${error.message}`);
      return null;
    }
  }

  async generateDynamicCSV() {
    console.log("🚀 Starting dynamic wallet discovery and analysis...\n");
    
    // Step 1: Find addresses dynamically
    const foundAddresses = await this.findActiveAaveUsers();
    console.log(`\n🎯 Found ${foundAddresses.length} potential addresses to analyze\n`);
    
    if (foundAddresses.length === 0) {
      console.log("❌ No addresses found. Check your API keys and network connection.");
      return;
    }
    
    // Step 2: Analyze each address
    const results = [];
    let activeCount = 0;
    
    for (let i = 0; i < foundAddresses.length && i < 50; i++) { // Limit to 50 to avoid rate limits
      const wallet = foundAddresses[i];
      console.log(`Progress: ${i + 1}/${Math.min(foundAddresses.length, 50)}`);
      
      const metrics = await this.analyzeWallet(wallet);
      if (metrics) {
        results.push(metrics);
        activeCount++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`\n📊 Analysis complete! Found ${activeCount} wallets with Aave activity out of ${foundAddresses.length} discovered addresses`);

    if (results.length === 0) {
      console.log("❌ No active Aave wallets found in discovered addresses.");
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
      const csvRow = csvHeaders.map(header => {
        const value = row[header];
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value}"`;
        }
        return value;
      }).join(',');
      csvContent += csvRow + '\n';
    });

    const filename = `dynamic_wallet_metrics_${new Date().toISOString().split('T')[0]}.csv`;
    fs.writeFileSync(filename, csvContent);
    
    console.log(`\n💾 CSV file saved: ${filename}`);
    console.log(`📈 Total wallets analyzed: ${results.length}`);
    
    // Summary stats
    console.log("\n📊 SUMMARY STATISTICS:");
    const avgCollateral = results.reduce((sum, w) => sum + parseFloat(w.total_collateral), 0) / results.length;
    const avgDebt = results.reduce((sum, w) => sum + parseFloat(w.total_borrowed), 0) / results.length;
    const avgAge = results.reduce((sum, w) => sum + parseInt(w.account_age_days), 0) / results.length;
    
    console.log(`Average Collateral: ${avgCollateral.toFixed(4)} ETH`);
    console.log(`Average Debt: ${avgDebt.toFixed(4)} ETH`);
    console.log(`Average Account Age: ${Math.round(avgAge)} days`);
    console.log(`Discovery Success Rate: ${(activeCount / foundAddresses.length * 100).toFixed(2)}%`);
    
    return filename;
  }
}

async function main() {
  const finder = new DynamicWalletFinder();
  await finder.generateDynamicCSV();
}

main().catch(console.error);