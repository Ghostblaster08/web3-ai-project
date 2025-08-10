import React, { useState } from "react";
import CreditScoreGauge from "./components/CreditScoreGauge";

function App() {
  const [account, setAccount] = useState(null);
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(false);

  // Connect to Metamask
  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        setAccount(accounts[0]);
      } catch (err) {
        console.error("Wallet connection failed", err);
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  // Fetch score from backend
  const fetchScore = async () => {
    if (!account) return alert("Connect wallet first");
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8080/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repayment_ratio: 0.9,
          liquidation_ratio: 0.1,
          total_borrowed: 5000,
          portfolio_diversity: 0.8,
          account_age: 2,
          activity_frequency: 0.7,
        }),
      });
      const data = await response.json();
      setScore(data.credit_score);
    } catch (err) {
      console.error("Error fetching score:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>Crypto Credit Score</h1>

      {!account ? (
        <button onClick={connectWallet}>Connect MetaMask</button>
      ) : (
        <p>Connected: {account}</p>
      )}

      <button onClick={fetchScore} disabled={loading}>
        {loading ? "Fetching..." : "Get My Credit Score"}
      </button>

      {score !== null && (
        <div style={{ marginTop: "30px" }}>
          <CreditScoreGauge score={score} label="Your Credit Score" />
        </div>
      )}
    </div>
  );
}

export default App;
