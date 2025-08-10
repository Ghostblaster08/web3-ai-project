import { useState } from "react";
import { FaWallet } from "react-icons/fa";
import { ethers } from "ethers";

export default function WalletConnection({ onWalletConnected }) {
  const [walletAddress, setWalletAddress] = useState("");

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        setWalletAddress(accounts[0]);
        onWalletConnected(accounts[0]);
      } catch (error) {
        console.error("Wallet connection failed:", error);
      }
    } else {
      alert("MetaMask not detected!");
    }
  };

  return (
    <div className="card">
      <h2><FaWallet /> Wallet Connection</h2>
      <p>
        {walletAddress
          ? `Connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
          : "Connect your MetaMask wallet to get started"}
      </p>
      {!walletAddress && (
        <button onClick={connectWallet} className="primary-btn">
          <FaWallet /> Connect MetaMask
        </button>
      )}
    </div>
  );
}
