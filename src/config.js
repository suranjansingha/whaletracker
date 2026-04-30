'use strict';
require('dotenv').config();

const config = {
  // RPC Sources
  ethApiKey: process.env.ETH_API_KEY || null,
  infuraRpc: process.env.INFURA_RPC || null,

  // Identity & Enrichment
  debankApiKey:   process.env.DEBANK_API_KEY   || null,
  neynarApiKey:   process.env.NEYNAR_API_KEY   || null,
  openSeaApiKey:  process.env.OPENSEA_API_KEY  || null,
  clayApiKey:     process.env.CLAY_API_KEY     || null,
  apolloApiKey:   process.env.APOLLO_API_KEY   || null,
  googleSheetId:  process.env.GOOGLE_SHEET_ID  || null,

  // Tracker settings
  minEthBalance: parseFloat(process.env.MIN_ETH_BALANCE || '20'),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '30000', 10),
  blockRange: parseInt(process.env.BLOCK_RANGE || '500', 10),

  // Contracts
  targetContracts: (process.env.TARGET_CONTRACTS || '')
    .split(',')
    .map(a => a.trim().toLowerCase())
    .filter(a => a.startsWith('0x')),

  // API endpoints
  etherscanBase: 'https://api.etherscan.io/v2/api',
  debankBase: 'https://pro-openapi.debank.com/v1',
  // Free public RPC — guaranteed fallback even without Infura
  publicRpc: 'https://cloudflare-eth.com',
};

function validate() {
  const errors = [];
  if (!config.ethApiKey && !config.infuraRpc) {
    errors.push('At least one of ETH_API_KEY or INFURA_RPC must be set.');
  }
  if (config.targetContracts.length === 0) {
    errors.push('TARGET_CONTRACTS must contain at least one valid 0x address.');
  }
  return errors;
}

module.exports = { config, validate };
