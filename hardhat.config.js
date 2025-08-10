require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();

module.exports = {
  solidity: "0.8.28",
  etherscan: {
    apiKey: process.env.API_KEY,
  },
};
