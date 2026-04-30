#!/usr/bin/env node
'use strict';
/**
 * Quick health check — run anytime:
 *   node healthcheck.js
 */

require('dotenv/config');
const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const LEADS_PATH = path.join(__dirname, 'whale_leads.json');
const ETH_KEY    = process.env.ETH_API_KEY;
const SHEET_ID   = process.env.GOOGLE_SHEET_ID;

async function check() {
  console.log('\n🩺  Whale Tracker Health Check\n' + '─'.repeat(40));

  // 1. Archive file
  if (fs.existsSync(LEADS_PATH)) {
    const data = JSON.parse(fs.readFileSync(LEADS_PATH, 'utf8'));
    const age  = Math.round((Date.now() - new Date(data.meta.lastUpdated)) / 60000);
    console.log(`✅ Archive:      ${data.meta.total} leads | last updated ${age} min ago`);
    if (age > 30) console.log('⚠️  Warning: archive not updated in >30 mins');
  } else {
    console.log('⚠️  Archive:      whale_leads.json not found (first run?)');
  }

  // 2. Etherscan API
  try {
    const r = await axios.get('https://api.etherscan.io/v2/api', {
      params: { chainid: 1, module: 'proxy', action: 'eth_blockNumber', apikey: ETH_KEY },
      timeout: 5000,
    });
    const block = parseInt(r.data.result, 16);
    console.log(`✅ Etherscan:    connected | latest block ${block.toLocaleString()}`);
  } catch (e) {
    console.log(`❌ Etherscan:    FAILED — ${e.message}`);
  }

  // 3. Neynar API
  try {
    if (!process.env.NEYNAR_API_KEY) throw new Error('NEYNAR_API_KEY not set');
    await axios.get('https://api.neynar.com/v2/farcaster/user/bulk-by-address', {
      params: { addresses: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' },
      headers: { api_key: process.env.NEYNAR_API_KEY },
      timeout: 5000,
    });
    console.log(`✅ Neynar:       connected`);
  } catch (e) {
    console.log(`❌ Neynar:       FAILED — ${e.message}`);
  }

  // 4. OpenSea API
  try {
    if (!process.env.OPENSEA_API_KEY) throw new Error('OPENSEA_API_KEY not set');
    await axios.get('https://api.opensea.io/api/v2/accounts/0xd8da6bf26964af9d7eed9e03e53415d37aa96045', {
      headers: { 'x-api-key': process.env.OPENSEA_API_KEY },
      timeout: 5000,
    });
    console.log(`✅ OpenSea:      connected`);
  } catch (e) {
    const ok = e.response?.status === 404; // 404 = valid key, no profile
    console.log(`${ok ? '✅' : '❌'} OpenSea:      ${ok ? 'connected' : 'FAILED — ' + e.message}`);
  }

  // 5. Google Sheets
  console.log(`${SHEET_ID ? '✅' : '❌'} Google Sheet: ${SHEET_ID ? 'ID configured → https://docs.google.com/spreadsheets/d/' + SHEET_ID : 'GOOGLE_SHEET_ID not set'}`);

  // 6. Env summary
  console.log('\n📋 Environment:');
  console.log(`   MIN_ETH_BALANCE:  ${process.env.MIN_ETH_BALANCE || '20'} ETH`);
  console.log(`   POLL_INTERVAL_MS: ${process.env.POLL_INTERVAL_MS || '60000'} ms`);
  console.log(`   BLOCK_RANGE:      ${process.env.BLOCK_RANGE || '200'} blocks`);
  console.log('');
}

check().catch(console.error);
