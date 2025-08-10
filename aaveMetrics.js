require("dotenv").config();
const { ethers } = require("ethers");

// Aave v2 LendingPool contract (Ethereum mainnet) - Corrected address
const LENDING_POOL_ADDRESS = "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9";

// Minimal ABI to get account data
const LENDING_POOL_ABI = [
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralETH,uint256 totalDebtETH,uint256 availableBorrowsETH,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)"
];

async function main() {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_URL);
    const lendingPool = new ethers.Contract(LENDING_POOL_ADDRESS, LENDING_POOL_ABI, provider);

    console.log(`Checking Aave data for wallet: ${process.env.WALLET}`);
    
    const accountData = await lendingPool.getUserAccountData(process.env.WALLET);

    const totalCollateral = Number(ethers.formatEther(accountData.totalCollateralETH));
    const totalDebt = Number(ethers.formatEther(accountData.totalDebtETH));
    const availableBorrows = Number(ethers.formatEther(accountData.availableBorrowsETH));
    const healthFactor = Number(ethers.formatEther(accountData.healthFactor));
    const ltv = Number(accountData.ltv) / 100; // Convert from basis points to percentage
    const liquidationThreshold = Number(accountData.currentLiquidationThreshold) / 100;

    // Liquidity ratio (Collateral to Debt ratio)
    const liquidityRatio = totalDebt > 0 ? totalCollateral / totalDebt : Infinity;

    // Additional metrics
    const borrowUtilization = totalCollateral > 0 ? totalDebt / totalCollateral : 0;
    const riskLevel = healthFactor < 1.5 ? "High Risk" : healthFactor < 2 ? "Medium Risk" : "Low Risk";

    const metrics = {
      wallet: process.env.WALLET,
      aaveMetrics: {
        totalCollateralETH: totalCollateral.toFixed(6),
        totalDebtETH: totalDebt.toFixed(6),
        availableBorrowsETH: availableBorrows.toFixed(6),
        healthFactor: healthFactor.toFixed(2),
        liquidationThreshold: liquidationThreshold.toFixed(2) + "%",
        loanToValue: ltv.toFixed(2) + "%",
        liquidityRatio: liquidityRatio === Infinity ? "No Debt" : liquidityRatio.toFixed(2),
        borrowUtilization: (borrowUtilization * 100).toFixed(2) + "%",
        riskLevel: riskLevel,
        hasActivePosition: totalCollateral > 0 || totalDebt > 0
      }
    };

    console.log("\n=== AAVE LENDING METRICS ===");
    console.log(JSON.stringify(metrics, null, 2));

    // Risk analysis
    console.log("\n=== RISK ANALYSIS ===");
    if (totalCollateral === 0 && totalDebt === 0) {
      console.log("❌ No active Aave positions found");
    } else {
      console.log(`💰 Total Collateral: ${totalCollateral.toFixed(6)} ETH`);
      console.log(`💸 Total Debt: ${totalDebt.toFixed(6)} ETH`);
      console.log(`❤️  Health Factor: ${healthFactor.toFixed(2)} ${healthFactor > 2 ? "✅" : healthFactor > 1.5 ? "⚠️" : "🚨"}`);
      console.log(`📊 Risk Level: ${riskLevel}`);
      
      if (healthFactor < 1) {
        console.log("🚨 WARNING: Position can be liquidated!");
      } else if (healthFactor < 1.5) {
        console.log("⚠️  CAUTION: Health factor is low, consider adding collateral");
      }
    }

    return metrics;

  } catch (error) {
    console.error("Error fetching Aave metrics:", error);
    
    // Check if it's a network/connection issue
    if (error.message.includes("network") || error.message.includes("connection")) {
      console.log("💡 Tip: Check your ALCHEMY_URL in .env file");
    }
    
    // Check if it's an address issue
    if (error.message.includes("address") || error.message.includes("checksum")) {
      console.log("💡 Tip: Check your WALLET address in .env file");
    }
  }
}

main().catch(console.error);
