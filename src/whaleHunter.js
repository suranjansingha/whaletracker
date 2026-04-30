'use strict';
/**
 * Task 1: The Whale Hunter
 *
 * Monitors target contracts for Deposit/Swap/Transfer events.
 * Primary:  Etherscan getLogs API
 * Fallback: Infura RPC eth_getLogs (activates automatically on rate-limit / missing key)
 */

const axios = require('axios');
const { ethers } = require('ethers');
const { config } = require('./config');

// ─── Common ERC-20 / DeFi event topic signatures ────────────────────────────
const EVENT_TOPICS = {
  Transfer: ethers.id('Transfer(address,address,uint256)'),
  Deposit:  ethers.id('Deposit(address,uint256)'),
  Swap:     ethers.id('Swap(address,uint256,uint256,uint256,uint256,address)'),
  // Uniswap V3 Swap
  SwapV3:   ethers.id('Swap(address,address,int256,int256,uint160,uint128,int24)'),
};

// ─── Static blocklist: known protocol/exchange/bridge contracts ───────────────
// These will NEVER be real whale leads — skip them immediately
const KNOWN_CONTRACTS = new Set([
  // Tokens / Wrapped assets
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
  '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
  '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
  // Uniswap
  '0xe592427a0aece92de3edee1f18e0157c05861564', // Uniswap V3 Router
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', // Uniswap V2 Router
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', // Uniswap Universal Router
  // Aave
  '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', // Aave V3 Pool
  '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9', // Aave V2 Lending Pool
  // Compound
  '0xc3d688b66703497daa19211eedff47f25384cdc3', // Compound V3
  '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b', // Compound V2 Comptroller
  // Curve
  '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7', // Curve 3Pool
  // Exchange hot wallets
  '0x28c6c06298d514db089934071355e5743bf21d60', // Binance 14
  '0x21a31ee1afc51d94c2efccaa2092ad1028285549', // Binance 15
  '0xdfd5293d8e347dfe59e90efd55b2956a1343963d', // Binance 16
  '0x56eddb7aa87536c09ccc2793473599fd21a8b17f', // Binance 17
  '0x9696f59e4d72e237be84ffd425dcad154bf96976', // Binance Bridge
  '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be', // Binance 1 (old)
  '0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec', // Kraken 13
  '0xda9dfa130df4de4673b89022ee50ff26f6ea73cf', // Kraken 15
  '0x2910543af39aba0cd09dbb2d50200b3e800a63d2', // Kraken 1
  '0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0', // Kraken 2
  // Bridges
  '0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf', // Polygon Bridge
  '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1', // Optimism Bridge
  '0x8eb8a3b98659cce290402893d0123abb75e3ab28', // Avalanche Bridge
]);

// ─── Etherscan: getLogs ──────────────────────────────────────────────────────
async function fetchLogsEtherscan(contractAddress, fromBlock, toBlock) {
  const params = {
    chainid: 1,
    module: 'logs',
    action: 'getLogs',
    address: contractAddress,
    fromBlock,
    toBlock,
    apikey: config.ethApiKey,
  };

  const { data } = await axios.get(config.etherscanBase, { params, timeout: 10000 });

  if (data.status === '0' && data.message === 'NOTOK') {
    throw new Error(`Etherscan error: ${data.result}`);
  }
  return data.result || [];
}

// ─── Infura RPC: eth_getLogs (fallback) ─────────────────────────────────────
async function fetchLogsInfura(contractAddress, fromBlock, toBlock) {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getLogs',
    params: [{
      address: contractAddress,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock:   `0x${toBlock.toString(16)}`,
      topics: [Object.values(EVENT_TOPICS)],
    }],
  };

  const { data } = await axios.post(config.infuraRpc, body, { timeout: 12000 });

  if (data.error) throw new Error(`Infura RPC error: ${data.error.message}`);
  return data.result || [];
}

// ─── Get current block ───────────────────────────────────────────────────────
async function getLatestBlock() {
  // Try Etherscan first
  if (config.ethApiKey) {
    try {
      const { data } = await axios.get(config.etherscanBase, {
        params: { chainid: 1, module: 'proxy', action: 'eth_blockNumber', apikey: config.ethApiKey },
        timeout: 8000,
      });
      const raw = data.result;
      if (raw && raw !== '0x') return parseInt(raw, 16);
    } catch { /* fall through */ }
  }
  // Fallback: public Cloudflare RPC (free, no key)
  const { data } = await axios.post(config.publicRpc, {
    jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [],
  }, { timeout: 8000 });
  return parseInt(data.result, 16);
}

// ─── Get ETH balance for a wallet ────────────────────────────────────────────
async function getEthBalance(address) {
  try {
    // Try Infura or public RPC first (faster)
    const rpc = config.infuraRpc || config.publicRpc;
    const { data } = await axios.post(rpc, {
      jsonrpc: '2.0', id: 1, method: 'eth_getBalance',
      params: [address, 'latest'],
    }, { timeout: 8000 });
    return parseFloat(ethers.formatEther(BigInt(data.result)));
  } catch {
    // Fallback: Etherscan
    try {
      const { data } = await axios.get(config.etherscanBase, {
        params: { chainid: 1, module: 'account', action: 'balance', address, tag: 'latest', apikey: config.ethApiKey },
        timeout: 8000,
      });
      return parseFloat(ethers.formatEther(BigInt(data.result)));
    } catch { return 0; }
  }
}

// ─── Check if an address is a smart contract (not a real wallet) ──────────────
// eth_getCode returns '0x' for EOAs, anything longer = contract
async function isContract(address) {
  try {
    if (config.infuraRpc) {
      const { data } = await axios.post(config.infuraRpc, {
        jsonrpc: '2.0', id: 1, method: 'eth_getCode',
        params: [address, 'latest'],
      }, { timeout: 6000 });
      return data.result && data.result !== '0x';
    }
    // Etherscan V2 proxy
    const { data } = await axios.get(config.etherscanBase, {
      params: {
        chainid: 1, module: 'proxy', action: 'eth_getCode',
        address, tag: 'latest', apikey: config.ethApiKey,
      },
      timeout: 6000,
    });
    return data.result && data.result !== '0x';
  } catch {
    return false; // assume EOA on error (safe default)
  }
}

// ─── Extract unique wallet addresses from logs ────────────────────────────────
function extractWallets(logs) {
  const wallets = new Set();
  for (const log of logs) {
    // topics[1] and topics[2] are typically from/to addresses (padded 32 bytes)
    if (log.topics?.[1]) {
      const addr = '0x' + log.topics[1].slice(26);
      if (addr !== '0x0000000000000000000000000000000000000000') wallets.add(addr.toLowerCase());
    }
    if (log.topics?.[2]) {
      const addr = '0x' + log.topics[2].slice(26);
      if (addr !== '0x0000000000000000000000000000000000000000') wallets.add(addr.toLowerCase());
    }
  }
  return [...wallets];
}

// ─── Main hunter: scan contracts, filter by balance ──────────────────────────
async function runWhaleHunter(fromBlock, toBlock, logger) {
  const whaleWallets = [];

  for (const contract of config.targetContracts) {
    logger.info(`🔍 Scanning contract ${contract} | blocks ${fromBlock}→${toBlock}`);

    let logs = [];
    let source = 'Etherscan';

    // Sleep to prevent Etherscan free-tier rate limits (Max 5 calls/sec)
    await new Promise(res => setTimeout(res, 250));

    try {
      if (!config.ethApiKey) throw new Error('No ETH_API_KEY — switching to Infura RPC');
      logs = await fetchLogsEtherscan(contract, fromBlock, toBlock);
    } catch (err) {
      if (!config.infuraRpc) {
        logger.warn(`⚠️  Both Etherscan and Infura unavailable for ${contract}: ${err.message}`);
        continue;
      }
      logger.warn(`⚡ Etherscan failed (${err.message}) → switching to Infura RPC`);
      source = 'Infura RPC';
      try {
        logs = await fetchLogsInfura(contract, fromBlock, toBlock);
      } catch (rpcErr) {
        logger.error(`❌ Infura also failed for ${contract}: ${rpcErr.message}`);
        continue;
      }
    }

    logger.info(`   ↳ Found ${logs.length} log entries via ${source}`);
    const wallets = extractWallets(logs);
    logger.info(`   ↳ Unique wallets: ${wallets.length}`);

    // Filter by balance and contract status
    for (const wallet of wallets) {
      // Layer 1: static blocklist (instant, no API call)
      if (KNOWN_CONTRACTS.has(wallet)) {
        logger.info(`   ⛔ Skipped known contract: ${wallet}`);
        await sleep(50);
        continue;
      }

      const balance = await getEthBalance(wallet);
      if (balance < config.minEthBalance) {
        await sleep(200);
        continue;
      }

      // Layer 2: live contract check via eth_getCode
      const contractAddress = await isContract(wallet);
      if (contractAddress) {
        logger.info(`   ⛔ Skipped smart contract (has bytecode): ${wallet}`);
        await sleep(200);
        continue;
      }

      logger.info(`   🐋 WHALE: ${wallet} | ${balance.toFixed(4)} ETH`);
      whaleWallets.push({ address: wallet, ethBalance: balance, sourceContract: contract });
      await sleep(200);
    }
  }

  return whaleWallets;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { runWhaleHunter, getLatestBlock };
