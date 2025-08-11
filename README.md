## Wallet & Aave Analyzer - React Frontend

This React application provides advanced wallet analysis and Aave protocol integration with a beautiful 3D animated interface.

### Features

- **MetaMask Integration**: Connect your wallet directly
- **Manual Address Analysis**: Analyze any Ethereum address
- **Transaction History**: Complete transaction analysis with gas tracking
- **Aave Protocol Integration**: View lending positions, collateral, and health factors
- **Credit Score Calculation**: Animated speedometer showing calculated credit score
- **3D Background**: Spline 3D scene integration
- **Liquid Glass Effects**: Modern glass morphism UI design
- **Data Export**: Download analysis results as JSON

### Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### Technology Stack

- React 18.2.0
- Web3.js 4.0.3
- Ethers.js 5.7.2
- Anime.js 3.2.1
- Spline React 2.2.6
- Custom CSS with Liquid Glass effects

### Components

- `WalletConnection.jsx` - MetaMask wallet connection interface
- `UserInfoForm.jsx` - Manual address input form
- `CreditScoreGauge.jsx` - Animated speedometer for credit score display

### Configuration

Make sure to:
1. Replace the Etherscan API key in `App.js`
2. Ensure MetaMask is installed for wallet functionality
3. Update the Spline scene URL if needed

### Build for Production

```bash
npm run build
```

This builds the app for production to the `build` folder.
