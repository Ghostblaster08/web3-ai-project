require("dotenv").config();
const { ethers } = require("ethers");
const fs = require('fs');
const axios = require('axios');

const LENDING_POOL_ADDRESS = "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9";

const LENDING_POOL_ABI = [
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralETH,uint256 totalDebtETH,uint256 availableBorrowsETH,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)"
];

class MaximalAaveDataFinder {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_URL);
    this.lendingPool = new ethers.Contract(LENDING_POOL_ADDRESS, LENDING_POOL_ABI, this.provider);
    this.etherscanApiKey = process.env.API_KEY;
    this.aaveUsers = new Set();
    this.checkedCount = 0;
    this.activeCount = 0;
    this.targetActiveUsers = 5000; // Increased target
    this.maxRetries = 3;
    this.processedAddresses = new Set(); // Track processed addresses for uniqueness
  }

  async fetchMaximalAaveUsers() {
    console.log("🚀 MAXIMAL Aave user collection - targeting 5000+ unique active users...\n");
    
    const methods = [
      () => this.fetchFromLendingPool(),
      () => this.fetchFromAaveTokens(),
      () => this.fetchFromGovernanceToken(),
      () => this.fetchFromRecentBlocks(),
      () => this.fetchFromHighValueTransactions(),
      () => this.fetchFromDeFiProtocols(),
      () => this.fetchFromExistingCSV(),
      () => this.fetchFromAddressList()
    ];

    for (const method of methods) {
      try {
        console.log(`\n📊 Current unique addresses: ${this.aaveUsers.size}`);
        await method();
        
        if (this.aaveUsers.size >= 20000) { // Stop collecting if we have enough candidates
          console.log("🎯 Reached 20k candidate addresses, moving to analysis...");
          break;
        }
      } catch (error) {
        console.log(`Method failed: ${error.message}`);
      }
    }

    return Array.from(this.aaveUsers);
  }

  async fetchFromLendingPool() {
    console.log("📊 Method 1: Comprehensive LendingPool scan...");
    
    for (let page = 1; page <= 200; page++) { // Increased pages
      const transactions = await this.makeEtherscanRequest('https://api.etherscan.io/api', {
        module: 'account',
        action: 'txlist',
        address: LENDING_POOL_ADDRESS,
        page: page,
        offset: 1000,
        sort: 'desc',
        apikey: this.etherscanApiKey
      });

      if (transactions && transactions.length > 0) {
        transactions.forEach(tx => {
          if (tx.from && this.isValidAddress(tx.from)) {
            this.aaveUsers.add(tx.from.toLowerCase());
          }
        });
        
        if (page % 25 === 0) {
          console.log(`   📄 LendingPool page ${page}: ${this.aaveUsers.size} total addresses`);
        }
      } else {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`   ✅ LendingPool scan: ${this.aaveUsers.size} addresses`);
  }

  async fetchFromAaveTokens() {
    console.log("📊 Method 2: All major aToken contracts...");
    
    const allAaveTokens = [
      { address: "0x028171bCA77440897B824Ca71D1c56caC55b68A3", name: "aDAI" },
      { address: "0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811", name: "aUSDC" },
      { address: "0xBcca60bB61934080951369a648Fb03DF4F96263C", name: "aUSDT" },
      { address: "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e", name: "aWETH" },
      { address: "0x9ff58f4fFB29fA2266Ab25e75e2A8b3503311656", name: "aWBTC" },
      { address: "0x5165d24277cD063F5ac44Efd447B27025e888f37", name: "aYFI" },
      { address: "0xF256CC7847E919FAc9B808cC216cAc87CCF2b0E", name: "aLINK" },
      { address: "0x6C5024Cd4F8A59110119C56f8933403A539555EB", name: "aSUSD" },
      { address: "0x625aE63000f46200499120B906716420bd059240", name: "aSNX" },
      { address: "0x6Fb0855c404E09c47C3fBCA25f08d4E41f9F062f", name: "aREN" },
      { address: "0x71fc860F7D3A592A4a98740e39dB31d25db65ae8", name: "aUNI" },
      { address: "0xCC12AbE4ff81c9378D670De1b57F8e0Dd228D77a", name: "aENJ" }
    ];

    for (const token of allAaveTokens) {
      console.log(`      📊 Processing ${token.name}...`);
      
      for (let page = 1; page <= 50; page++) { // Increased pages per token
        const transactions = await this.makeEtherscanRequest('https://api.etherscan.io/api', {
          module: 'account',
          action: 'txlist',
          address: token.address,
          page: page,
          offset: 1000,
          sort: 'desc',
          apikey: this.etherscanApiKey
        });

        if (transactions && transactions.length > 0) {
          transactions.forEach(tx => {
            if (tx.from && this.isValidAddress(tx.from)) {
              this.aaveUsers.add(tx.from.toLowerCase());
            }
          });
        } else {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
    
    console.log(`   ✅ aToken scan: ${this.aaveUsers.size} total addresses`);
  }

  async fetchFromGovernanceToken() {
    console.log("📊 Method 3: AAVE governance token holders...");
    
    const aaveTokenAddress = "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9";
    
    for (let page = 1; page <= 100; page++) { // More comprehensive scan
      const transactions = await this.makeEtherscanRequest('https://api.etherscan.io/api', {
        module: 'account',
        action: 'tokentx',
        contractaddress: aaveTokenAddress,
        page: page,
        offset: 1000,
        sort: 'desc',
        apikey: this.etherscanApiKey
      });

      if (transactions && transactions.length > 0) {
        transactions.forEach(tx => {
          if (tx.from && this.isValidAddress(tx.from)) {
            this.aaveUsers.add(tx.from.toLowerCase());
          }
          if (tx.to && this.isValidAddress(tx.to)) {
            this.aaveUsers.add(tx.to.toLowerCase());
          }
        });
      } else {
        break;
      }

      if (page % 10 === 0) {
        console.log(`      📊 AAVE token page ${page}: ${this.aaveUsers.size} total addresses`);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`   ✅ AAVE token scan: ${this.aaveUsers.size} total addresses`);
  }

  async fetchFromRecentBlocks() {
    console.log("📊 Method 4: Recent high-activity blocks...");
    
    try {
      const latestBlockResponse = await this.makeEtherscanRequest('https://api.etherscan.io/api', {
        module: 'proxy',
        action: 'eth_blockNumber',
        apikey: this.etherscanApiKey
      });
      
      if (latestBlockResponse) {
        const latestBlock = parseInt(latestBlockResponse, 16);
        
        // Scan more recent blocks
        for (let i = 0; i < 200; i++) {
          const blockNumber = latestBlock - i;
          
          const blockResponse = await this.makeEtherscanRequest('https://api.etherscan.io/api', {
            module: 'proxy',
            action: 'eth_getBlockByNumber',
            tag: `0x${blockNumber.toString(16)}`,
            boolean: true,
            apikey: this.etherscanApiKey
          });
          
          if (blockResponse && blockResponse.transactions) {
            blockResponse.transactions.forEach(tx => {
              if (tx.from) this.aaveUsers.add(tx.from.toLowerCase());
              if (tx.to) this.aaveUsers.add(tx.to.toLowerCase());
            });
          }
          
          if (i % 50 === 0) {
            console.log(`      📊 Block ${i}: ${this.aaveUsers.size} total addresses`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Recent blocks method failed: ${error.message}`);
    }
    
    console.log(`   ✅ Recent blocks scan: ${this.aaveUsers.size} total addresses`);
  }

  async fetchFromHighValueTransactions() {
    console.log("📊 Method 5: High-value transactions (likely DeFi users)...");
    
    try {
      // Get transactions with high ETH values
      for (let page = 1; page <= 50; page++) {
        const transactions = await this.makeEtherscanRequest('https://api.etherscan.io/api', {
          module: 'account',
          action: 'txlist',
          sort: 'desc',
          page: page,
          offset: 1000,
          apikey: this.etherscanApiKey
        });

        if (transactions && transactions.length > 0) {
          transactions.forEach(tx => {
            const value = parseFloat(ethers.formatEther(tx.value || '0'));
            if (value > 50) { // High-value transactions (50+ ETH)
              if (tx.from) this.aaveUsers.add(tx.from.toLowerCase());
              if (tx.to) this.aaveUsers.add(tx.to.toLowerCase());
            }
          });
        } else {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.log(`   ⚠️  High-value transactions method failed: ${error.message}`);
    }
    
    console.log(`   ✅ High-value transactions: ${this.aaveUsers.size} total addresses`);
  }

  async fetchFromDeFiProtocols() {
    console.log("📊 Method 6: Other major DeFi protocols (cross-protocol users)...");
    
    const defiProtocols = [
      "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9", // Aave V2
      "0x398eC7346DcD622eDc5ae82352F02bE94C62d119", // Aave V1
      "0x3dfd23A6c5E8BbcFc9581d2E864a68feb6a076d3", // Aave AMM
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH (wrapped ETH)
      "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
      "0xA0b86a33E6417c4C7cA0C03db1EC0Bf4e6431E66"  // UNI
    ];

    for (const protocol of defiProtocols) {
      for (let page = 1; page <= 30; page++) {
        const transactions = await this.makeEtherscanRequest('https://api.etherscan.io/api', {
          module: 'account',
          action: 'txlist',
          address: protocol,
          page: page,
          offset: 1000,
          sort: 'desc',
          apikey: this.etherscanApiKey
        });

        if (transactions && transactions.length > 0) {
          transactions.forEach(tx => {
            if (tx.from && this.isValidAddress(tx.from)) {
              this.aaveUsers.add(tx.from.toLowerCase());
            }
          });
        } else {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
    
    console.log(`   ✅ DeFi protocols scan: ${this.aaveUsers.size} total addresses`);
  }

  async fetchFromExistingCSV() {
    console.log("📊 Method 7: Loading from existing CSV files...");
    
    try {
      const csvFiles = fs.readdirSync('.').filter(file => 
        file.includes('aave') && file.endsWith('.csv')
      );
      
      for (const csvFile of csvFiles) {
        const content = fs.readFileSync(csvFile, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach(line => {
          const address = line.split(',')[0];
          if (address && this.isValidAddress(address)) {
            this.aaveUsers.add(address.toLowerCase());
          }
        });
      }
      
      console.log(`   ✅ Loaded addresses from ${csvFiles.length} CSV files`);
    } catch (error) {
      console.log(`   ⚠️  CSV loading failed: ${error.message}`);
    }
    
    console.log(`   ✅ CSV scan: ${this.aaveUsers.size} total addresses`);
  }

  async fetchFromAddressList() {
    console.log("📊 Method 8: Loading from addresses.txt...");
    
    try {
      if (fs.existsSync('addresses.txt')) {
        const content = fs.readFileSync('addresses.txt', 'utf8');
        const lines = content.split('\n');
        
        lines.forEach(line => {
          const address = line.trim().split(/[\s,]+/)[0];
          if (address && this.isValidAddress(address)) {
            this.aaveUsers.add(address.toLowerCase());
          }
        });
        
        console.log(`   ✅ Loaded addresses from addresses.txt`);
      }
    } catch (error) {
      console.log(`   ⚠️  addresses.txt loading failed: ${error.message}`);
    }
    
    console.log(`   ✅ Address list scan: ${this.aaveUsers.size} total addresses`);
  }

  async makeEtherscanRequest(url, params, retryCount = 0) {
    try {
      const response = await axios.get(url, {
        params: params,
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.data && response.data.status === "1") {
        return response.data.result;
      }
      return [];
      
    } catch (error) {
      if (retryCount < this.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
        return await this.makeEtherscanRequest(url, params, retryCount + 1);
      }
      return [];
    }
  }

  isValidAddress(address) {
    return address && 
           typeof address === 'string' && 
           /^0x[a-fA-F0-9]{40}$/.test(address) &&
           address !== '0x0000000000000000000000000000000000000000';
  }

  async analyzeAaveUser(address) {
    try {
      this.checkedCount++;
      
      // Skip if already processed (ensure uniqueness)
      if (this.processedAddresses.has(address.toLowerCase())) {
        return null;
      }
      this.processedAddresses.add(address.toLowerCase());
      
      if (this.checkedCount % 50 === 0) {
        console.log(`📊 Progress: Analyzed ${this.checkedCount} users, found ${this.activeCount} active | Target: ${this.targetActiveUsers}`);
      }
      
      const accountData = await this.lendingPool.getUserAccountData(address);
      const totalCollateral = Number(ethers.formatEther(accountData.totalCollateralETH));
      const totalDebt = Number(ethers.formatEther(accountData.totalDebtETH));
      const healthFactor = Number(ethers.formatEther(accountData.healthFactor));
      
      const hasActivity = totalCollateral > 0 || totalDebt > 0;
      
      if (!hasActivity) {
        return null;
      }

      if (totalCollateral < 0.001 && totalDebt < 0.0001) {
        return null;
      }
      
      this.activeCount++;
      
      console.log(`   ✅ ACTIVE USER #${this.activeCount}: ${address}`);
      console.log(`      💰 Collateral: ${totalCollateral.toFixed(6)} ETH | 💸 Debt: ${totalDebt.toFixed(6)} ETH`);
      
      const transactions = await this.getTransactionsWithRetry(address);
      await new Promise(resolve => setTimeout(resolve, 100));
      
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

  async getTransactionsWithRetry(address, retryCount = 0) {
    try {
      const response = await axios.get(`https://api.etherscan.io/api`, {
        params: {
          module: 'account',
          action: 'txlist',
          address: address,
          startblock: 0,
          endblock: 99999999,
          sort: 'asc',
          apikey: this.etherscanApiKey
        },
        timeout: 15000
      });
      
      return response.data.status === "1" ? response.data.result : [];
    } catch (error) {
      if (retryCount < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await this.getTransactionsWithRetry(address, retryCount + 1);
      }
      return [];
    }
  }

  calculatePortfolioDiversity(transactions) {
    const tokenCounts = {};
    let totalValue = 0;
    
    transactions.forEach(tx => {
      const value = parseFloat(tx.value);
      if (value > 0) {
        tokenCounts['ETH'] = (tokenCounts['ETH'] || 0) + value;
        totalValue += value;
      }
      if (tx.to && tx.to !== tx.from) {
        tokenCounts[tx.to] = (tokenCounts[tx.to] || 0) + 1;
      }
    });
    
    const uniqueTokens = Object.keys(tokenCounts).length;
    
    if (uniqueTokens === 0 || totalValue === 0) {
      return { diversityScore: 0, uniqueTokens: 0 };
    }
    
    const values = Object.values(tokenCounts);
    const total = values.reduce((a, b) => a + b, 0);
    const hhi = values.reduce((sum, value) => sum + Math.pow(value/total, 2), 0);
    const diversityScore = 1 - hhi;
    
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

  async generateMaximalCSV() {
    console.log("🚀 Starting MAXIMAL Aave dataset collection...\n");
    
    const aaveUsers = await this.fetchMaximalAaveUsers();
    
    if (aaveUsers.length === 0) {
      console.log("❌ No Aave users found from any source.");
      return;
    }
    
    console.log(`\n🎯 Analyzing ${aaveUsers.length} discovered unique Aave addresses...`);
    console.log(`🎯 TARGET: ${this.targetActiveUsers} unique active users`);
    console.log("⏱️  Starting comprehensive analysis...\n");
    
    const results = [];
    const maxToAnalyze = Math.min(aaveUsers.length, 15000); // Increased limit
    
    for (let i = 0; i < maxToAnalyze; i++) {
      const address = aaveUsers[i];
      
      const metrics = await this.analyzeAaveUser(address);
      if (metrics) {
        results.push(metrics);
      }
      
      if (results.length >= this.targetActiveUsers) {
        console.log(`\n🎯 SUCCESS! Reached target of ${this.targetActiveUsers} unique active users!`);
        break;
      }
      
      if (this.checkedCount % 100 === 0) {
        console.log(`\n📊 CHECKPOINT: ${this.checkedCount} checked | ${this.activeCount} active | ${(this.activeCount/this.checkedCount*100).toFixed(1)}% success rate`);
        console.log(`   🎯 Progress: ${results.length}/${this.targetActiveUsers} target (${((results.length/this.targetActiveUsers)*100).toFixed(1)}%)`);
      }
    }

    console.log(`\n📊 FINAL MAXIMAL RESULTS:`);
    console.log(`   Total unique addresses discovered: ${aaveUsers.length}`);
    console.log(`   Total unique addresses analyzed: ${this.checkedCount}`);
    console.log(`   🎯 Unique active Aave users found: ${this.activeCount}`);
    console.log(`   📈 Success rate: ${((this.activeCount / this.checkedCount) * 100).toFixed(2)}%`);
    console.log(`   ✅ UNIQUE ENTRIES IN CSV: ${results.length}`);

    if (results.length === 0) {
      console.log("❌ No users with active Aave positions found.");
      return;
    }

    const csvHeaders = [
      'address',
      'repayment_ratio', 
      'liquidation_ratio',
      'total_borrowed',
      'portfolio_diversity',
      'account_age_days',
      'activity_frequency',
      'total_collateral',
      'unique_tokens',
      'total_transactions'
    ];

    let csvContent = csvHeaders.join(',') + '\n';
    
    results.forEach(row => {
      const csvRow = csvHeaders.map(header => row[header]).join(',');
      csvContent += csvRow + '\n';
    });

    const filename = `maximal_aave_users_${results.length}_unique_${new Date().toISOString().split('T')[0]}.csv`;
    fs.writeFileSync(filename, csvContent);
    
    console.log(`\n💾 MAXIMAL CSV saved: ${filename}`);
    console.log(`📈 UNIQUE active Aave users in CSV: ${results.length}`);
    console.log(`🔒 GUARANTEED UNIQUENESS: Each address appears only once`);
    
    if (results.length > 0) {
      console.log(`\n📋 Sample results (first 3 unique entries):`);
      results.slice(0, 3).forEach((result, i) => {
        console.log(`${i + 1}. ${result.address}`);
        console.log(`   Collateral: ${result.total_collateral} ETH | Debt: ${result.total_borrowed} ETH`);
        console.log(`   Portfolio Diversity: ${result.portfolio_diversity} | Age: ${result.account_age_days} days`);
      });
    }
    
    return filename;
  }
}

async function main() {
  console.log("🎯 Starting MAXIMAL Dynamic Aave Data Collection (TARGET: 5000+ unique users)...\n");
  
  const finder = new MaximalAaveDataFinder();
  await finder.generateMaximalCSV();
}

main().catch(console.error);