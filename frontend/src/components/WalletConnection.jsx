import React from 'react';

const WalletConnection = ({ walletAddress, connectWallet, error }) => {
  return (
    <div className="wallet-section">
      {!walletAddress ? (
        <button onClick={connectWallet} className="connect-btn">
          Connect MetaMask Wallet
        </button>
      ) : (
        <div>
          <p style={{ color: '#4CAF50', marginBottom: '10px' }}>✅ Wallet Connected</p>
          <div className="wallet-address">
            <strong>Address:</strong> {walletAddress}
          </div>
        </div>
      )}
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
    </div>
  );
};

export default WalletConnection;
