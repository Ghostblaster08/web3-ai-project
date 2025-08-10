require("dotenv").config();
const { ethers } = require("ethers");
const fs = require('fs');
const axios = require('axios');

const LENDING_POOL_ADDRESS = "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9";

const LENDING_POOL_ABI = [
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralETH,uint256 totalDebtETH,uint256 availableBorrowsETH,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)"
];

class DuneAaveDataFinder {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_URL);
    this.lendingPool = new ethers.Contract(LENDING_POOL_ADDRESS, LENDING_POOL_ABI, this.provider);
    this.duneApiKey = process.env.DUNE_API_KEY;
    this.etherscanApiKey = process.env.API_KEY;
    this.aaveUsers = new Set();
    this.checkedCount = 0;
    this.activeCount = 0;
  }

  async fetchAaveUsersFromDune() {
    console.log("🔍 Fetching Aave users from Dune Analytics with REAL queries...\n");
    
    if (!this.duneApiKey) {
      console.log("❌ No DUNE_API_KEY found. Using Etherscan only...");
      return await this.fetchFromAlternativeSources();
    }

    try {
      const addresses = new Set();

      // Method 1: Create and execute a custom query for recent Aave borrowers
      console.log("   📊 Creating custom Dune query for Aave borrowers...");
      
      const borrowersQuery = `
        WITH recent_borrows AS (
          SELECT DISTINCT 
            "user" as borrower_address,
            SUM("amount") as total_borrowed_usd
          FROM aave_v2_ethereum.borrow
          WHERE "evt_block_time" >= CURRENT_DATE - INTERVAL '30' DAY
          GROUP BY "user"
          HAVING SUM("amount") > 100
          ORDER BY total_borrowed_usd DESC
          LIMIT 500
        )
        SELECT borrower_address FROM recent_borrows
      `;

      const borrowerAddresses = await this.executeCustomDuneQuery(borrowersQuery, "Recent Borrowers");
      borrowerAddresses.forEach(addr => addresses.add(addr));

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Method 2: Create query for recent depositors  
      console.log("   📊 Creating custom Dune query for Aave depositors...");
      
      const depositorsQuery = `
        WITH recent_deposits AS (
          SELECT DISTINCT 
            "user" as depositor_address,
            SUM("amount") as total_deposited_usd
          FROM aave_v2_ethereum.deposit
          WHERE "evt_block_time" >= CURRENT_DATE - INTERVAL '30' DAY
          GROUP BY "user"
          HAVING SUM("amount") > 500
          ORDER BY total_deposited_usd DESC
          LIMIT 500
        )
        SELECT depositor_address FROM recent_deposits
      `;

      const depositorAddresses = await this.executeCustomDuneQuery(depositorsQuery, "Recent Depositors");
      depositorAddresses.forEach(addr => addresses.add(addr));

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Method 3: Get users with current positions
      console.log("   📊 Creating custom Dune query for users with active positions...");
      
      const activeUsersQuery = `
        WITH current_positions AS (
          SELECT DISTINCT
            borrower as active_user
          FROM aave_v2_ethereum.borrow b
          WHERE NOT EXISTS (
            SELECT 1 FROM aave_v2_ethereum.repay r 
            WHERE r.user = b.user 
            AND r.evt_block_time > b.evt_block_time
            AND r.amount >= b.amount
          )
          AND b.evt_block_time >= CURRENT_DATE - INTERVAL '90' DAY
          UNION
          SELECT DISTINCT
            user as active_user  
          FROM aave_v2_ethereum.deposit d
          WHERE NOT EXISTS (
            SELECT 1 FROM aave_v2_ethereum.withdraw w
            WHERE w.user = d.user
            AND w.evt_block_time > d.evt_block_time  
            AND w.amount >= d.amount
          )
          AND d.evt_block_time >= CURRENT_DATE - INTERVAL '90' DAY
        )
        SELECT active_user FROM current_positions LIMIT 1000
      `;

      const activeAddresses = await this.executeCustomDuneQuery(activeUsersQuery, "Active Position Holders");
      activeAddresses.forEach(addr => addresses.add(addr));

      if (addresses.size > 0) {
        console.log(`\n🎯 Total unique addresses from Dune: ${addresses.size}`);
        addresses.forEach(addr => this.aaveUsers.add(addr));
        return Array.from(addresses);
      } else {
        console.log("   ❌ No data from Dune custom queries. Using Etherscan...");
        return await this.fetchFromAlternativeSources();
      }

    } catch (error) {
      console.log(`❌ Error with Dune API: ${error.message}`);
      return await this.fetchFromAlternativeSources();
    }
  }

  async executeCustomDuneQuery(sql, queryName) {
    try {
      console.log(`      🔄 Executing ${queryName} query...`);
      
      // Create the query
      const createResponse = await axios.post('https://api.dune.com/api/v1/query', {
        query_sql: sql,
        name: `${queryName} - ${Date.now()}`,
        description: `Fetching ${queryName} for Aave analysis`
      }, {
        headers: {
          'X-Dune-API-Key': this.duneApiKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      if (!createResponse.data || !createResponse.data.query_id) {
        throw new Error(`Failed to create query for ${queryName}`);
      }

      const queryId = createResponse.data.query_id;
      console.log(`      📝 Created query ${queryId} for ${queryName}`);

      // Execute the query
      const executeResponse = await axios.post(`https://api.dune.com/api/v1/query/${queryId}/execute`, {}, {
        headers: {
          'X-Dune-API-Key': this.duneApiKey
        },
        timeout: 15000
      });

      if (!executeResponse.data || !executeResponse.data.execution_id) {
        throw new Error(`Failed to execute query for ${queryName}`);
      }

      const executionId = executeResponse.data.execution_id;
      console.log(`      ⏳ Execution ${executionId} started for ${queryName}, polling for results...`);

      // Poll for results with longer timeout
      let attempts = 0;
      const maxAttempts = 20;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
        try {
          const resultResponse = await axios.get(`https://api.dune.com/api/v1/execution/${executionId}/results`, {
            headers: {
              'X-Dune-API-Key': this.duneApiKey
            },
            timeout: 15000
          });

          if (resultResponse.data) {
            const state = resultResponse.data.state;
            console.log(`      📊 Query ${queryName} status: ${state}`);
            
            if (state === 'QUERY_STATE_COMPLETED') {
              const rows = resultResponse.data.result?.rows || [];
              console.log(`      ✅ ${queryName} completed: ${rows.length} records`);
              
              // Extract addresses from various possible column names
              const addresses = [];
              rows.forEach(row => {
                const address = row.borrower_address || row.depositor_address || row.active_user || 
                               row.user || row.address || row.borrower || row.account;
                if (address && this.isValidAddress(address)) {
                  addresses.push(address.toLowerCase());
                }
              });
              
              return addresses;
            } else if (state === 'QUERY_STATE_FAILED') {
              throw new Error(`Query execution failed for ${queryName}`);
            }
          }
        } catch (pollError) {
          console.log(`      ⚠️  Poll attempt ${attempts + 1} failed: ${pollError.message}`);
        }
        
        attempts++;
      }
      
      throw new Error(`Query ${queryName} timed out after ${maxAttempts} attempts`);
      
    } catch (error) {
      console.log(`      ❌ Error executing ${queryName}: ${error.message}`);
      return [];
    }
  }

  async fetchFromAlternativeSources() {
    console.log("📊 Fetching Aave users from EXPANDED alternative sources...\n");
    
    const addresses = new Set();

    try {
      // Method 1: Get MORE pages from Aave contract transactions
      console.log("   🔄 Fetching recent Aave contract interactions (expanded)...");
      
      for (let page = 1; page <= 50; page++) { // Increased from 10 to 50 pages
        const response = await axios.get('https://api.etherscan.io/api', {
          params: {
            module: 'account',
            action: 'txlist',
            address: LENDING_POOL_ADDRESS,
            page: page,
            offset: 1000,
            sort: 'desc',
            apikey: this.etherscanApiKey
          }
        });

        if (response.data && response.data.status === "1") {
          response.data.result.forEach(tx => {
            if (tx.from && this.isValidAddress(tx.from)) {
              addresses.add(tx.from.toLowerCase());
            }
          });
          
          if (page % 10 === 0) {
            console.log(`   📄 Processed ${page} pages: ${addresses.size} unique addresses so far`);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 150)); // Faster requests
      }

      // Method 2: Get addresses from MORE Aave token contracts
      console.log("   🔄 Fetching from expanded aToken contracts...");
      
      const allAaveTokens = [
        "0x028171bCA77440897B824Ca71D1c56caC55b68A3", // aDAI
        "0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811", // aUSDC
        "0x625aE63000f46200499120B906716420bd059240", // aLINK
        "0xBcca60bB61934080951369a648Fb03DF4F96263C", // aUSDT
        "0x9ff58f4fFB29fA2266Ab25e75e2A8b3503311656", // aWBTC
        "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e", // aWETH
        "0x272F97b7a56a387aE942350bBC7Df5700f8a4576", // aUNI
        "0xFFC97d72E13E01096502Cb8Eb52dEe56f74DAD7B", // aAAVE
      ];

      for (const aToken of allAaveTokens) {
        for (let page = 1; page <= 5; page++) { // Multiple pages per token
          const response = await axios.get('https://api.etherscan.io/api', {
            params: {
              module: 'account',
              action: 'txlist',
              address: aToken,
              page: page,
              offset: 1000,
              sort: 'desc',
              apikey: this.etherscanApiKey
            }
          });

          if (response.data && response.data.status === "1") {
            response.data.result.forEach(tx => {
              if (tx.from && this.isValidAddress(tx.from)) {
                addresses.add(tx.from.toLowerCase());
              }
            });
          }

          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Method 3: Get addresses from Aave governance token transactions
      console.log("   🔄 Fetching from AAVE governance token...");
      
      const aaveTokenAddress = "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9";
      for (let page = 1; page <= 10; page++) {
        const response = await axios.get('https://api.etherscan.io/api', {
          params: {
            module: 'account',
            action: 'tokentx',
            contractaddress: aaveTokenAddress,
            page: page,
            offset: 1000,
            sort: 'desc',
            apikey: this.etherscanApiKey
          }
        });

        if (response.data && response.data.status === "1") {
          response.data.result.forEach(tx => {
            if (tx.from && this.isValidAddress(tx.from)) {
              addresses.add(tx.from.toLowerCase());
            }
            if (tx.to && this.isValidAddress(tx.to)) {
              addresses.add(tx.to.toLowerCase());
            }
          });
        }

        await new Promise(resolve => setTimeout(resolve, 150));
      }

      console.log(`\n✅ Total unique addresses from EXPANDED sources: ${addresses.size}`);
      addresses.forEach(addr => this.aaveUsers.add(addr));
      return Array.from(addresses);

    } catch (error) {
      console.log(`❌ Error fetching expanded alternative data: ${error.message}`);
      return [];
    }
  }

  isValidAddress(address) {
    return address && 
           typeof address === 'string' && 
           /^0x[a-fA-F0-9]{40}$/.test(address) &&
           address !== '0x0000000000000000000000000000000000000000' &&
           address.toLowerCase() !== LENDING_POOL_ADDRESS.toLowerCase();
  }

  async analyzeAaveUser(address) {
    try {
      this.checkedCount++;
      
      if (this.checkedCount % 25 === 0) {
        console.log(`📊 Progress: Analyzed ${this.checkedCount} users, found ${this.activeCount} with active positions`);
      }
      
      const accountData = await this.lendingPool.getUserAccountData(address);
      const totalCollateral = Number(ethers.formatEther(accountData.totalCollateralETH));
      const totalDebt = Number(ethers.formatEther(accountData.totalDebtETH));
      const healthFactor = Number(ethers.formatEther(accountData.healthFactor));
      
      // ✅ CONFIRMED: Only storing ACTIVE Aave users
      const hasActivity = totalCollateral > 0 || totalDebt > 0;
      
      if (!hasActivity) {
        return null; // Skip inactive users
      }

      // Filter out dust positions  
      if (totalCollateral < 0.001 && totalDebt < 0.0001) {
        return null; // Skip dust amounts
      }
      
      this.activeCount++;
      
      console.log(`   ✅ ACTIVE USER #${this.activeCount}: ${address}`);
      console.log(`      Collateral: ${totalCollateral.toFixed(6)} ETH, Debt: ${totalDebt.toFixed(6)} ETH`);
      
      // Get transaction data for portfolio analysis
      const transactions = await this.getTransactions(address);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const portfolioDiversity = this.calculatePortfolioDiversity(transactions);
      const accountAge = this.calculateAccountAge(transactions);
      const activityFrequency = this.calculateActivityFrequency(transactions);
      
      // Calculate repayment ratio (collateral to debt ratio)
      const repaymentRatio = totalDebt > 0 ? (totalCollateral / totalDebt) : 0;
      
      // Health factor as liquidation ratio
      const liquidationRatio = healthFactor === Infinity ? 0 : healthFactor;
      
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

  // ... rest of the methods remain the same
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
          apikey: this.etherscanApiKey
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

  async generateDuneAaveCSV() {
    console.log("🚀 Generating EXPANDED Aave user dataset...\n");
    
    // Step 1: Fetch Aave users with expanded methods
    const aaveUsers = await this.fetchAaveUsersFromDune();
    
    if (aaveUsers.length === 0) {
      console.log("❌ No Aave users found from any source.");
      return;
    }
    
    console.log(`\n🎯 Analyzing ${aaveUsers.length} discovered Aave users...`);
    console.log("⏱️  Getting on-chain metrics for ACTIVE users only...\n");
    
    // Step 2: Analyze each user  
    const results = [];
    
    // Analyze more users to get a larger dataset
    const maxToAnalyze = Math.min(aaveUsers.length, 500); // Increased limit
    
    for (let i = 0; i < maxToAnalyze; i++) {
      const address = aaveUsers[i];
      
      const metrics = await this.analyzeAaveUser(address);
      if (metrics) {
        results.push(metrics);
      }
      
      // Stop if we have enough data
      if (results.length >= 100) { // Increased target
        console.log(`\n🎯 Collected 100 active users, stopping analysis...`);
        break;
      }
    }

    console.log(`\n📊 FINAL RESULTS:`);
    console.log(`   Total addresses discovered: ${aaveUsers.length}`);
    console.log(`   Total addresses analyzed: ${this.checkedCount}`);
    console.log(`   Active Aave users found: ${this.activeCount}`);
    console.log(`   Success rate: ${((this.activeCount / this.checkedCount) * 100).toFixed(2)}%`);
    console.log(`   ✅ CONFIRMED: Only storing ACTIVE Aave users in CSV`);

    if (results.length === 0) {
      console.log("❌ No users with active Aave positions found.");
      return;
    }

    // Step 3: Generate CSV in exact format
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

    const filename = `aave_active_users_${new Date().toISOString().split('T')[0]}.csv`;
    fs.writeFileSync(filename, csvContent);
    
    console.log(`\n💾 CSV saved: ${filename}`);
    console.log(`📈 ACTIVE Aave users in CSV: ${results.length}`);
    console.log(`📋 CSV format: ${csvHeaders.join(', ')}`);
    
    return filename;
  }
}

async function main() {
  console.log("🎯 Starting EXPANDED Dynamic Aave Data Collection...\n");
  
  const finder = new DuneAaveDataFinder();
  await finder.generateDuneAaveCSV();
}

main().catch(console.error);