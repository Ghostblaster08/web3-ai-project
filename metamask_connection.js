const { MetaMaskSDK } = require('@metamask/sdk');
const Web3 = require('web3');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

class MetaMaskWalletAnalyzer {
    constructor() {
        this.sdk = new MetaMaskSDK({
            dappMetadata: {
                name: "Wallet Analyzer",
                url: "http://localhost:3000",
            },
            infuraAPIKey: process.env.INFURA_API_KEY, // Optional
        });
        this.web3 = null;
        this.account = null;
    }

    async connectWallet() {
        try {
            console.log("Connecting to MetaMask...");
            
            // Connect to MetaMask
            const accounts = await this.sdk.connect();
            this.account = accounts[0];
            
            // Initialize Web3
            this.web3 = new Web3(this.sdk.getProvider());
            
            console.log(`Connected to wallet: ${this.account}`);
            return this.account;
        } catch (error) {
            console.error("Error connecting to MetaMask:", error);
            throw error;
        }
    }

    async getBalance() {
        if (!this.web3 || !this.account) {
            throw new Error("Wallet not connected");
        }

        const balance = await this.web3.eth.getBalance(this.account);
        const ethBalance = this.web3.utils.fromWei(balance, 'ether');
        
        console.log(`Current Balance: ${ethBalance} ETH`);
        return ethBalance;
    }

    async fetchTransactions() {
        if (!this.account) {
            throw new Error("Wallet not connected");
        }

        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            console.log("No API key found. Using existing transactions.json file.");
            return this.loadExistingTransactions();
        }

        try {
            console.log("Fetching transactions from Etherscan...");
            
            const url = `https://api.etherscan.io/api`;
            const params = {
                module: 'account',
                action: 'txlist',
                address: this.account,
                startblock: 0,
                endblock: 99999999,
                sort: 'asc',
                apikey: apiKey
            };

            const response = await axios.get(url, { params });
            
            if (response.data.status === "1") {
                const transactions = response.data.result;
                console.log(`Found ${transactions.length} transactions`);
                
                // Save to file
                fs.writeFileSync('wallet_transactions.json', JSON.stringify(transactions, null, 2));
                console.log("Transactions saved to wallet_transactions.json");
                
                return transactions;
            } else {
                console.error("Error fetching transactions:", response.data.message);
                return [];
            }
        } catch (error) {
            console.error("Error fetching transactions:", error);
            return [];
        }
    }

    loadExistingTransactions() {
        try {
            const data = fs.readFileSync('transactions.json', 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.log("No existing transactions file found.");
            return [];
        }
    }

    async getNetworkInfo() {
        if (!this.web3) {
            throw new Error("Web3 not initialized");
        }

        const networkId = await this.web3.eth.net.getId();
        const blockNumber = await this.web3.eth.getBlockNumber();
        
        const networks = {
            1: "Ethereum Mainnet",
            3: "Ropsten Testnet",
            4: "Rinkeby Testnet",
            5: "Goerli Testnet",
            11155111: "Sepolia Testnet"
        };

        console.log(`Network: ${networks[networkId] || `Unknown (${networkId})`}`);
        console.log(`Latest Block: ${blockNumber}`);
        
        return {
            networkId,
            networkName: networks[networkId] || `Unknown (${networkId})`,
            blockNumber
        };
    }

    async analyzeWallet() {
        try {
            // Connect to wallet
            await this.connectWallet();
            
            // Get basic info
            const balance = await this.getBalance();
            const networkInfo = await this.getNetworkInfo();
            
            // Fetch transactions
            const transactions = await this.fetchTransactions();
            
            // Prepare data for Python analysis
            const walletData = {
                address: this.account,
                balance: balance,
                network: networkInfo,
                transactions: transactions,
                analysis_timestamp: new Date().toISOString()
            };

            // Save complete wallet data
            fs.writeFileSync('wallet_data.json', JSON.stringify(walletData, null, 2));
            console.log("Complete wallet data saved to wallet_data.json");

            // Run Python analysis
            console.log("\n=== Running Python Analysis ===");
            await this.runPythonAnalysis();

            return walletData;

        } catch (error) {
            console.error("Error analyzing wallet:", error);
        }
    }

    async runPythonAnalysis() {
        const { spawn } = require('child_process');
        
        return new Promise((resolve, reject) => {
            const python = spawn('python', ['analyze_transactions.py']);
            
            python.stdout.on('data', (data) => {
                console.log(data.toString());
            });
            
            python.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });
            
            python.on('close', (code) => {
                if (code === 0) {
                    console.log("Python analysis completed successfully");
                    resolve();
                } else {
                    console.error(`Python analysis failed with code ${code}`);
                    reject(new Error(`Python analysis failed`));
                }
            });
        });
    }
}

// Main execution
async function main() {
    const analyzer = new MetaMaskWalletAnalyzer();
    
    try {
        await analyzer.analyzeWallet();
    } catch (error) {
        console.error("Analysis failed:", error);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = MetaMaskWalletAnalyzer;