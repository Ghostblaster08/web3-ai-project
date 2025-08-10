const axios = require("axios");
require("dotenv").config();
const fs = require('fs');

async function getTransactions(address) {
  const url = `https://api.etherscan.io/api
    ?module=account
    &action=txlist
    &address=${address}
    &startblock=0
    &endblock=99999999
    &sort=asc
    &apikey=${process.env.API_KEY}`
    .replace(/\s+/g, '');

  const res = await axios.get(url);
  return res.data.result;
}

(async () => {
  const address = "0x40B38765696e3d5d8d9d834D8AaD4bB6e418E489";
  const txs = await getTransactions(address);
  console.log(`Found ${txs.length} transactions`);
  
  // Better formatted output
  console.log("First transaction details:");
  console.log(JSON.stringify(txs[0], null, 2));
  
  // Or save to file
  fs.writeFileSync('transactions.json', JSON.stringify(txs, null, 2));
  console.log("Transactions saved to transactions.json");
})();
