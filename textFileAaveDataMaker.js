require("dotenv").config();
const { ethers } = require("ethers");
const fs = require('fs');
const axios = require('axios');

const LENDING_POOL_ADDRESS = "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9";

const LENDING_POOL_ABI = [
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralETH,uint256 totalDebtETH,uint256 availableBorrowsETH,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)"
];

class TextFileAaveDataFinder {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_URL);
    this.lendingPool = new ethers.Contract(LENDING_POOL_ADDRESS, LENDING_POOL_ABI, this.provider);
    this.etherscanApiKey = process.env.API_KEY;
    this.checkedCount = 0;
    this.activeCount = 0;
    this.skippedCount = 0;
  }

  readAddressesFromFile(filePath) {
    console.log(`📁 Reading addresses from: ${filePath}\n`);
    
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const addresses = new Set();
      
      // Split by various delimiters and clean up
      const lines = fileContent
        .split(/[\n\r,;|\s]+/) // Split by newlines, commas, semicolons, pipes, or spaces
        .map(line => line.trim())
        .filter(line => line.length > 0);

      lines.forEach(line => {
        // Extract Ethereum addresses from the line (might contain other text)
        const addressMatches = line.match(/0x[a-fA-F0-9]{40}/g);
        if (addressMatches) {
          addressMatches.forEach(address => {
            if (this.isValidAddress(address)) {
              addresses.add(address.toLowerCase());
            }
          });
        }
      });

      console.log(`✅ Found ${addresses.size} unique valid addresses in file`);
      console.log(`📄 File contained ${lines.length} total lines`);
      
      if (addresses.size === 0) {
        console.log("❌ No valid Ethereum addresses found in file");
        console.log("   Expected format: One address per line or comma-separated");
        console.log("   Example: 0x742d35Cc6486C9A6B6f53df8e511731C6A96e671");
      }

      return Array.from(addresses);

    } catch (error) {
      console.log(`❌ Error reading file: ${error.message}`);
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
      
      if (this.checkedCount % 10 === 0) {
        console.log(`📊 Progress: Checked ${this.checkedCount} addresses | Active: ${this.activeCount} | Inactive: ${this.skippedCount}`);
      }
      
      // Check Aave account data
      const accountData = await this.lendingPool.getUserAccountData(address);
      const totalCollateral = Number(ethers.formatEther(accountData.totalCollateralETH));
      const totalDebt = Number(ethers.formatEther(accountData.totalDebtETH));
      const healthFactor = Number(ethers.formatEther(accountData.healthFactor));
      
      // ✅ ONLY PROCESS ACTIVE AAVE USERS
      const hasActivity = totalCollateral > 0 || totalDebt > 0;
      
      if (!hasActivity) {
        this.skippedCount++;
        return null; // Skip inactive users - NOT stored in CSV
      }

      // Filter out dust positions  
      if (totalCollateral < 0.001 && totalDebt < 0.0001) {
        this.skippedCount++;
        return null; // Skip dust amounts - NOT stored in CSV
      }
      
      this.activeCount++;
      
      console.log(`   ✅ ACTIVE USER #${this.activeCount}: ${address}`);
      console.log(`      💰 Collateral: ${totalCollateral.toFixed(6)} ETH`);
      console.log(`      💸 Debt: ${totalDebt.toFixed(6)} ETH`);
      console.log(`      🏥 Health Factor: ${healthFactor === Infinity ? 'No Debt' : healthFactor.toFixed(4)}`);
      
      // Get transaction data for portfolio analysis
      const transactions = await this.getTransactions(address);
      await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
      
      const portfolioDiversity = this.calculatePortfolioDiversity(transactions);
      const accountAge = this.calculateAccountAge(transactions);
      const activityFrequency = this.calculateActivityFrequency(transactions);
      
      // Calculate metrics for CSV
      const repaymentRatio = totalDebt > 0 ? (totalCollateral / totalDebt) : 0;
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
      console.log(`   ⚠️  Error analyzing ${address}: ${error.message}`);
      this.skippedCount++;
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
          apikey: this.etherscanApiKey
        }
      });
      
      if (response.data && response.data.status === "1") {
        return response.data.result;
      }
      return [];
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

  async generateCSVFromTextFile(filePath) {
    console.log("🚀 Processing addresses from text file for ACTIVE Aave users only...\n");
    
    // Step 1: Read addresses from file
    const addresses = this.readAddressesFromFile(filePath);
    
    if (addresses.length === 0) {
      console.log("❌ No valid addresses found in file.");
      return;
    }
    
    console.log(`\n🎯 Analyzing ${addresses.length} addresses for Aave activity...`);
    console.log("⏱️  Only ACTIVE Aave users will be stored in CSV...\n");
    
    // Step 2: Analyze each address
    const results = [];
    
    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      
      console.log(`\n🔍 Checking address ${i + 1}/${addresses.length}: ${address}`);
      
      const metrics = await this.analyzeAaveUser(address);
      if (metrics) {
        results.push(metrics);
        console.log(`      ✅ ADDED TO CSV`);
      } else {
        console.log(`      ❌ SKIPPED (No active Aave position)`);
      }
    }

    console.log(`\n📊 FINAL RESULTS:`);
    console.log(`   Total addresses in file: ${addresses.length}`);
    console.log(`   Total addresses checked: ${this.checkedCount}`);
    console.log(`   🟢 Active Aave users found: ${this.activeCount}`);
    console.log(`   🔴 Inactive/error addresses: ${this.skippedCount}`);
    console.log(`   📈 Success rate: ${((this.activeCount / this.checkedCount) * 100).toFixed(2)}%`);
    console.log(`   ✅ CSV will contain ONLY ${this.activeCount} active Aave users`);

    if (results.length === 0) {
      console.log("\n❌ No active Aave users found in the provided addresses.");
      console.log("   The CSV will not be created as there's no active data to store.");
      return;
    }

    // Step 3: Generate CSV in exact format requested
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

    const filename = `active_aave_users_from_file_${new Date().toISOString().split('T')[0]}.csv`;
    fs.writeFileSync(filename, csvContent);
    
    console.log(`\n💾 CSV saved: ${filename}`);
    console.log(`📈 Active Aave users in CSV: ${results.length}`);
    console.log(`📋 CSV format: ${csvHeaders.join(', ')}`);
    
    // Show sample data
    if (results.length > 0) {
      console.log(`\n📋 Sample active users (first 3):`);
      results.slice(0, 3).forEach((result, i) => {
        console.log(`${i + 1}. ${result.address}`);
        console.log(`   Collateral: ${result.total_collateral} ETH`);
        console.log(`   Debt: ${result.total_borrowed} ETH`);
        console.log(`   Repayment Ratio: ${result.repayment_ratio}`);
        console.log(`   Health Factor: ${result.liquidation_ratio}`);
      });
    }
    
    return filename;
  }
}

async function main() {
  // You can specify the file path here or pass it as a command line argument
  const args = process.argv.slice(2);
  let filePath = args[0];
  
  if (!filePath) {
    // Default file paths to try
    const possibleFiles = [
      'addresses.txt',
      'wallet_addresses.txt', 
      'aave_addresses.txt',
      'data/addresses.txt'
    ];
    
    // Try to find an existing file
    for (const file of possibleFiles) {
      if (fs.existsSync(file)) {
        filePath = file;
        break;
      }
    }
    
    if (!filePath) {
      console.log("❌ No address file found. Please provide a file path.");
      console.log("\n📝 Usage:");
      console.log("   node textFileAaveDataMaker.js addresses.txt");
      console.log("\n📄 File format examples:");
      console.log("   One address per line:");
      console.log("   0x742d35Cc6486C9A6B6f53df8e511731C6A96e671");
      console.log("   0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
      console.log("\n   Or comma-separated:");
      console.log("   0x742d35Cc6486C9A6B6f53df8e511731C6A96e671, 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
      return;
    }
  }
  
  console.log("🎯 Starting Text File Aave Data Processing...\n");
  console.log(`📁 Using file: ${filePath}`);
  console.log("✅ Will ONLY store ACTIVE Aave users in CSV\n");
  
  const finder = new TextFileAaveDataFinder();
  await finder.generateCSVFromTextFile(filePath);
}

main().catch(console.error);