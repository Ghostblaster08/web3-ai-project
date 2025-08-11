import React, { useState, useEffect } from 'react';
import Spline from '@splinetool/react-spline';
import WalletConnection from './components/WalletConnection';
import UserInfoForm from './components/UserInfoForm';
import CreditScoreGauge from './components/CreditScoreGauge';
import './App.css';

// Import Web3 and ethers
import Web3 from 'web3';
import { ethers } from 'ethers';

function App() {
  const [walletAddress, setWalletAddress] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [transactionData, setTransactionData] = useState(null);
  const [aaveData, setAaveData] = useState(null);
  const [creditScore, setCreditScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [web3, setWeb3] = useState(null);
  const [currentAccount, setCurrentAccount] = useState('');
  const [isMetaMaskConnected, setIsMetaMaskConnected] = useState(false);
  const [walletAnalysis, setWalletAnalysis] = useState(null);

  // Aave LendingPool contract address (mainnet)
  const AAVE_LENDING_POOL = '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9';
  const AAVE_LENDING_POOL_ABI = [
    {
      "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
      "name": "getUserAccountData",
      "outputs": [
        {"internalType": "uint256", "name": "totalCollateralETH", "type": "uint256"},
        {"internalType": "uint256", "name": "totalDebtETH", "type": "uint256"},
        {"internalType": "uint256", "name": "availableBorrowsETH", "type": "uint256"},
        {"internalType": "uint256", "name": "currentLiquidationThreshold", "type": "uint256"},
        {"internalType": "uint256", "name": "ltv", "type": "uint256"},
        {"internalType": "uint256", "name": "healthFactor", "type": "uint256"}
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ];

  // Etherscan API Key
  const ETHERSCAN_API_KEY = 'FP5WF72RTG6T4P8C21MUFFQATVSSGMYC6X';

  useEffect(() => {
    if (window.ethereum) {
      const web3Instance = new Web3(window.ethereum);
      setWeb3(web3Instance);
      
      // Check if already connected
      checkMetaMaskConnection();
    }
  }, []);

  const checkMetaMaskConnection = async () => {
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          const web3Instance = new Web3(window.ethereum);
          setWeb3(web3Instance);
          setCurrentAccount(accounts[0]);
          setWalletAddress(accounts[0]);
          setIsMetaMaskConnected(true);
          await getWalletInfo(accounts[0], web3Instance);
        }
      }
    } catch (error) {
      console.error('Error checking MetaMask connection:', error);
    }
  };

  const connectWallet = async () => {
    try {
      if (window.ethereum) {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        const web3Instance = new Web3(window.ethereum);
        setWeb3(web3Instance);
        const accounts = await web3Instance.eth.getAccounts();
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          setCurrentAccount(accounts[0]);
          setIsMetaMaskConnected(true);
          setError('');
          await getWalletInfo(accounts[0], web3Instance);
        }
      } else {
        setError('MetaMask not detected. Please install MetaMask.');
      }
    } catch (err) {
      setError('Failed to connect wallet: ' + err.message);
    }
  };

  const analyzeManualAddress = async () => {
    if (!manualAddress || !ethers.utils.isAddress(manualAddress)) {
      setError('Please enter a valid Ethereum address');
      return;
    }
    setCurrentAccount(manualAddress);
    setIsMetaMaskConnected(false);
    await getWalletInfoManual(manualAddress);
  };

  const getWalletInfo = async (address, web3Instance) => {
    try {
      const balance = await web3Instance.eth.getBalance(address);
      const ethBalance = web3Instance.utils.fromWei(balance, 'ether');
      
      const networkId = await web3Instance.eth.net.getId();
      const networks = {
        1: "Ethereum Mainnet",
        3: "Ropsten Testnet", 
        4: "Rinkeby Testnet",
        5: "Goerli Testnet",
        11155111: "Sepolia Testnet"
      };
      
      console.log(`Wallet connected: ${address}, Balance: ${parseFloat(ethBalance).toFixed(6)} ETH, Network: ${networks[networkId] || `Unknown (${networkId})`}`);
      
    } catch (error) {
      console.error('Error getting wallet info:', error);
    }
  };

  const getWalletInfoManual = async (address) => {
    try {
      const balanceResponse = await fetch(`https://api.etherscan.io/api?module=account&action=balance&address=${address}&tag=latest&apikey=${ETHERSCAN_API_KEY}`);
      const balanceData = await balanceResponse.json();
      
      let ethBalance = "0";
      if (balanceData.status === "1") {
        const weiBalance = balanceData.result;
        ethBalance = (parseInt(weiBalance) / Math.pow(10, 18)).toFixed(6);
      }
      
      console.log(`Manual address set: ${address}, Balance: ${ethBalance} ETH`);
      
    } catch (error) {
      console.error('Error getting wallet info:', error);
    }
  };

  const analyzeWallet = async () => {
    if (!currentAccount) {
      setError('Please connect a wallet or enter an address first');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      // Fetch transaction data and Aave data in parallel
      const [txData, aaveInfo] = await Promise.all([
        fetchTransactionData(currentAccount),
        fetchAaveData(currentAccount)
      ]);
      
      setTransactionData(txData);
      setAaveData(aaveInfo);
      
      // Perform wallet analysis
      const analysis = performWalletAnalysis(txData.transactions || []);
      setWalletAnalysis(analysis);
      
      // Calculate credit score using ML model
      const score = await calculateCreditScore(analysis, aaveInfo);
      setCreditScore(score);
      
    } catch (err) {
      setError('Failed to analyze address: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTransactionData = async (address) => {
    try {
      const response = await fetch(`https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`);
      const data = await response.json();
      
      if (data.status === '1' && data.result) {
        const transactions = data.result;
        
        return {
          totalTransactions: transactions.length,
          transactions: transactions,
          firstTxDate: transactions.length > 0 ? new Date(parseInt(transactions[0].timeStamp) * 1000) : null,
          lastTxDate: transactions.length > 0 ? new Date(parseInt(transactions[transactions.length - 1].timeStamp) * 1000) : null,
          totalGasUsed: transactions.reduce((sum, tx) => sum + parseInt(tx.gasUsed || 0), 0),
          avgGasPrice: transactions.length > 0 ? transactions.reduce((sum, tx) => sum + parseInt(tx.gasPrice || 0), 0) / transactions.length : 0
        };
      }
      return { totalTransactions: 0, transactions: [] };
    } catch (error) {
      console.error('Error fetching transaction data:', error);
      return { totalTransactions: 0, transactions: [] };
    }
  };

  const fetchAaveData = async (address) => {
    try {
      // Use Alchemy provider for better reliability
      const alchemyUrl = 'https://eth-mainnet.g.alchemy.com/v2/9kTdk9LXtVIUkZe5D-Xe5';
      const provider = new ethers.providers.JsonRpcProvider(alchemyUrl);
      const lendingPool = new ethers.Contract(AAVE_LENDING_POOL, AAVE_LENDING_POOL_ABI, provider);
      
      const accountData = await lendingPool.getUserAccountData(address);
      
      const totalCollateral = parseFloat(ethers.utils.formatEther(accountData.totalCollateralETH));
      const totalDebt = parseFloat(ethers.utils.formatEther(accountData.totalDebtETH));
      const availableBorrows = parseFloat(ethers.utils.formatEther(accountData.availableBorrowsETH));
      const healthFactor = parseFloat(ethers.utils.formatEther(accountData.healthFactor));
      const ltv = parseInt(accountData.ltv.toString()) / 100;
      const liquidationThreshold = parseInt(accountData.currentLiquidationThreshold.toString()) / 100;
      
      const liquidityRatio = totalDebt > 0 ? totalCollateral / totalDebt : Infinity;
      const borrowUtilization = totalCollateral > 0 ? (totalDebt / totalCollateral) * 100 : 0;
      
      let riskLevel = "Low Risk";
      if (healthFactor < 1.5 && healthFactor !== Infinity) {
        riskLevel = "High Risk";
      } else if (healthFactor < 2 && healthFactor !== Infinity) {
        riskLevel = "Medium Risk";
      }
      
      const hasActivePosition = totalCollateral > 0 || totalDebt > 0;
      
      return {
        totalCollateralETH: totalCollateral,
        totalDebtETH: totalDebt,
        availableBorrowsETH: availableBorrows,
        healthFactor: healthFactor,
        liquidationThreshold: liquidationThreshold,
        loanToValue: ltv,
        liquidityRatio: liquidityRatio,
        borrowUtilization: borrowUtilization,
        riskLevel: riskLevel,
        hasActivePosition: hasActivePosition
      };
    } catch (error) {
      console.error('Error fetching Aave data:', error);
      return {
        totalCollateralETH: 0,
        totalDebtETH: 0,
        availableBorrowsETH: 0,
        healthFactor: 0,
        liquidationThreshold: 0,
        loanToValue: 0,
        liquidityRatio: 0,
        borrowUtilization: 0,
        riskLevel: "No Data",
        hasActivePosition: false
      };
    }
  };

  const performWalletAnalysis = (transactions) => {
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
    
    const timestamps = transactions.map(tx => parseInt(tx.timeStamp) * 1000);
    const firstTx = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null;
    const accountAge = firstTx ? Math.floor((Date.now() - firstTx.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    
    const totalTxs = transactions.length;
    const avgDaily = accountAge > 0 ? totalTxs / accountAge : 0;
    
    const now = new Date();
    const last7Days = transactions.filter(tx => (now - new Date(parseInt(tx.timeStamp) * 1000)) / (1000 * 60 * 60 * 24) <= 7).length;
    const last30Days = transactions.filter(tx => (now - new Date(parseInt(tx.timeStamp) * 1000)) / (1000 * 60 * 60 * 24) <= 30).length;
    const last90Days = transactions.filter(tx => (now - new Date(parseInt(tx.timeStamp) * 1000)) / (1000 * 60 * 60 * 24) <= 90).length;
    
    return {
      portfolioDiversity: {
        diversityScore: diversityScore.toFixed(3),
        uniqueTokens: uniqueTokens,
        tokenDistribution: tokenCounts
      },
      accountAge: {
        accountAgeDays: accountAge,
        firstTransaction: firstTx ? firstTx.toISOString() : null
      },
      activityFrequency: {
        totalTransactions: totalTxs,
        avgDailyTransactions: avgDaily.toFixed(2),
        activityPeriods: {
          last7Days: last7Days,
          last30Days: last30Days,
          last90Days: last90Days
        }
      }
    };
  };

  const calculateCreditScore = async (walletAnalysis, aaveAnalysis) => {
    try {
      // Prepare features for ML model
      const features = prepareMLFeatures(walletAnalysis, aaveAnalysis);
      
      // Call backend API
      const response = await fetch('http://localhost:5000/predict-credit-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(features)
      });
      
      if (!response.ok) {
        throw new Error('Failed to get credit score prediction');
      }
      
      const result = await response.json();
      return result.credit_score;
      
    } catch (error) {
      console.error('Error getting ML credit score:', error);
      // Fallback to manual calculation if API fails
      return calculateCreditScoreManual(walletAnalysis, aaveAnalysis);
    }
  };

  const prepareMLFeatures = (walletAnalysis, aaveAnalysis) => {
    // Calculate repayment ratio (if available from Aave data)
    const repayment_ratio = aaveAnalysis && aaveAnalysis.totalCollateralETH > 0 
      ? Math.min(1, aaveAnalysis.totalCollateralETH / (aaveAnalysis.totalDebtETH || 1))
      : 1;

    // Calculate liquidation ratio
    const liquidation_ratio = aaveAnalysis && aaveAnalysis.totalDebtETH > 0
      ? aaveAnalysis.totalCollateralETH / aaveAnalysis.totalDebtETH
      : 1;

    return {
      repayment_ratio: repayment_ratio,
      liquidation_ratio: liquidation_ratio,
      total_borrowed: aaveAnalysis?.totalDebtETH || 0,
      portfolio_diversity: parseFloat(walletAnalysis?.portfolioDiversity?.diversityScore || 0),
      account_age_days: walletAnalysis?.accountAge?.accountAgeDays || 0,
      activity_frequency: parseFloat(walletAnalysis?.activityFrequency?.avgDailyTransactions || 0),
      total_collateral: aaveAnalysis?.totalCollateralETH || 0,
      unique_tokens: walletAnalysis?.portfolioDiversity?.uniqueTokens || 0,
      total_transactions: walletAnalysis?.activityFrequency?.totalTransactions || 0
    };
  };

  // Keep the original function as fallback
  const calculateCreditScoreManual = (walletAnalysis, aaveAnalysis) => {
    let score = 500; // Base score

    if (walletAnalysis) {
      // Account age (max +100 points)
      const ageBonus = Math.min(100, walletAnalysis.accountAge.accountAgeDays / 10);
      score += ageBonus;

      // Activity frequency (max +50 points)
      const activityBonus = Math.min(50, parseFloat(walletAnalysis.activityFrequency.avgDailyTransactions) * 500);
      score += activityBonus;

      // Portfolio diversity (max +50 points)
      const diversityBonus = parseFloat(walletAnalysis.portfolioDiversity.diversityScore) * 50;
      score += diversityBonus;

      // Transaction count (max +50 points)
      const txBonus = Math.min(50, walletAnalysis.activityFrequency.totalTransactions / 20);
      score += txBonus;
    }

    if (aaveAnalysis && aaveAnalysis.hasActivePosition) {
      // Aave participation bonus (+50 points)
      score += 50;

      // Health factor bonus (max +50 points)
      if (aaveAnalysis.healthFactor > 2) {
        score += 50;
      } else if (aaveAnalysis.healthFactor > 1.5) {
        score += 30;
      } else if (aaveAnalysis.healthFactor > 1.2) {
        score += 10;
      } else {
        score -= 50; // Penalty for risky positions
      }

      // Utilization penalty
      if (aaveAnalysis.borrowUtilization > 80) {
        score -= 30;
      } else if (aaveAnalysis.borrowUtilization > 60) {
        score -= 15;
      }
    }

    return Math.max(300, Math.min(850, Math.round(score)));
  };

  const downloadData = () => {
    const data = {
      address: currentAccount,
      creditScore,
      walletAnalysis,
      transactionData,
      aaveData,
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet-analysis-${currentAccount}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadSampleAddress = () => {
    setManualAddress('0x40B38765696e3d5d8d9d834D8AaD4bB6e418E489');
  };

  const loadActiveAaveAddress = () => {
    setManualAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
  };

  return (
    <div className="App">
      {/* 3D Background */}
      <div className="spline-background">
        <Spline scene="https://prod.spline.design/ojfTWVTN-6AkFMjm/scene.splinecode" />
      </div>

      {/* Main Content */}
      <div className="container">
        <h1 className="main-title">Advanced Wallet & Aave Analysis</h1>
        
        <div className="content-grid">
          {/* Wallet Connection Section */}
          <div className="glass-panel">
            <h2>Wallet Connection</h2>
            <WalletConnection 
              walletAddress={walletAddress}
              connectWallet={connectWallet}
              error={error}
            />
          </div>

          {/* Manual Address Input Section */}
          <div className="glass-panel">
            <h2>Manual Address Analysis</h2>
            <UserInfoForm 
              manualAddress={manualAddress}
              setManualAddress={setManualAddress}
              analyzeManualAddress={analyzeManualAddress}
              isLoading={isLoading}
              loadSampleAddress={loadSampleAddress}
              loadActiveAaveAddress={loadActiveAaveAddress}
            />
          </div>

          {/* Analysis Button */}
          <div className="glass-panel">
            <h2>Analysis Control</h2>
            <button 
              onClick={analyzeWallet}
              disabled={!currentAccount || isLoading}
              className="analyze-btn"
            >
              {isLoading ? 'Analyzing...' : '🔍 Full Analysis (Wallet + Aave)'}
            </button>
          </div>

          {/* Credit Score Display */}
          {creditScore > 0 && (
            <div className="glass-panel credit-score-panel">
              <h2>Credit Score</h2>
              <CreditScoreGauge score={creditScore} />
            </div>
          )}

          {/* Wallet Analysis Display */}
          {walletAnalysis && (
            <div className="glass-panel">
              <h2>📊 Wallet Analysis</h2>
              <div className="data-display">
                <p><strong>Portfolio Diversity Score:</strong> {walletAnalysis.portfolioDiversity.diversityScore}</p>
                <p><strong>Unique Tokens/Contracts:</strong> {walletAnalysis.portfolioDiversity.uniqueTokens}</p>
                <p><strong>Account Age:</strong> {walletAnalysis.accountAge.accountAgeDays} days</p>
                <p><strong>Total Transactions:</strong> {walletAnalysis.activityFrequency.totalTransactions}</p>
                <p><strong>Avg Daily Transactions:</strong> {walletAnalysis.activityFrequency.avgDailyTransactions}</p>
                
                <div style={{ marginTop: '15px' }}>
                  <strong>📈 Recent Activity:</strong>
                  <p><strong>Last 7 days:</strong> {walletAnalysis.activityFrequency.activityPeriods.last7Days} txs</p>
                  <p><strong>Last 30 days:</strong> {walletAnalysis.activityFrequency.activityPeriods.last30Days} txs</p>
                  <p><strong>Last 90 days:</strong> {walletAnalysis.activityFrequency.activityPeriods.last90Days} txs</p>
                </div>
              </div>
            </div>
          )}

          {/* Aave Data Display */}
          {aaveData && (
            <div className="glass-panel">
              <h2>🏦 Aave Position Analysis</h2>
              <div className="data-display">
                <div className={`aave-status ${aaveData.hasActivePosition ? 'aave-active' : 'aave-inactive'}`}>
                  {aaveData.hasActivePosition ? '✅ Active Aave User' : '❌ No Aave Activity'}
                </div>
                
                <p><strong>Total Collateral:</strong> {aaveData.totalCollateralETH.toFixed(6)} ETH</p>
                <p><strong>Total Debt:</strong> {aaveData.totalDebtETH.toFixed(6)} ETH</p>
                <p><strong>Available Borrows:</strong> {aaveData.availableBorrowsETH.toFixed(6)} ETH</p>
                <p><strong>Health Factor:</strong> {aaveData.healthFactor === Infinity || aaveData.healthFactor > 1000000 ? 'No Debt' : aaveData.healthFactor.toFixed(2)}</p>
                <p><strong>LTV:</strong> {aaveData.loanToValue.toFixed(2)}%</p>
                <p><strong>Liquidation Threshold:</strong> {aaveData.liquidationThreshold.toFixed(2)}%</p>
                <p><strong>Borrow Utilization:</strong> {aaveData.borrowUtilization.toFixed(2)}%</p>
                
                <div className={`risk-indicator ${aaveData.riskLevel === 'Low Risk' ? 'risk-low' : aaveData.riskLevel === 'Medium Risk' ? 'risk-medium' : 'risk-high'}`}>
                  Risk Level: {aaveData.riskLevel}
                </div>
              </div>
            </div>
          )}

          {/* Transaction Data Display */}
          {transactionData && (
            <div className="glass-panel">
              <h2>Transaction Analysis</h2>
              <div className="data-display">
                <p><strong>Total Transactions:</strong> {transactionData.totalTransactions}</p>
                <p><strong>First Transaction:</strong> {transactionData.firstTxDate?.toLocaleDateString()}</p>
                <p><strong>Last Transaction:</strong> {transactionData.lastTxDate?.toLocaleDateString()}</p>
                <p><strong>Total Gas Used:</strong> {transactionData.totalGasUsed?.toLocaleString()}</p>
                <p><strong>Average Gas Price:</strong> {Math.round(transactionData.avgGasPrice / 1e9)} Gwei</p>
              </div>
            </div>
          )}

          {/* Download Section */}
          {(transactionData || aaveData) && (
            <div className="glass-panel">
              <h2>Export Data</h2>
              <button onClick={downloadData} className="download-btn">
                📥 Download Analysis Data
              </button>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <p>Analyzing address...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
