import React from 'react';

const UserInfoForm = ({ 
  manualAddress, 
  setManualAddress, 
  analyzeManualAddress, 
  isLoading, 
  loadSampleAddress, 
  loadActiveAaveAddress 
}) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    analyzeManualAddress();
  };

  return (
    <div className="input-section">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Enter Ethereum address to analyze..."
          value={manualAddress}
          onChange={(e) => setManualAddress(e.target.value)}
          className="address-input"
        />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button 
            type="submit" 
            className="analyze-btn"
            disabled={isLoading}
          >
            {isLoading ? 'Analyzing...' : 'Analyze Address'}
          </button>
          <button 
            type="button" 
            className="analyze-btn"
            onClick={loadSampleAddress}
            style={{ background: 'linear-gradient(135deg, #00b894 0%, #00cec9 100%)' }}
          >
            Load Sample
          </button>
          <button 
            type="button" 
            className="analyze-btn"
            onClick={loadActiveAaveAddress}
            style={{ background: 'linear-gradient(135deg, #fd79a8 0%, #fdcb6e 100%)' }}
          >
            Load Aave User
          </button>
        </div>
      </form>
    </div>
  );
};

export default UserInfoForm;
