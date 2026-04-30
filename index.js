'use strict';
/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║        Stratefai Lead Engine — Phase 1                   ║
 * ║        Whale Hunter → Identity Resolver → Enrichment     ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   cp .env.example .env   # fill in your keys
 *   node index.js
 */

const { config, validate } = require('./src/config');
const { runWhaleHunter, getLatestBlock } = require('./src/whaleHunter');
const { resolveIdentity } = require('./src/identityResolver');
const { scrapeBiosForTelegram } = require('./src/bioScraper');
const { sendTelegramAlert } = require('./src/telegramAlert');
const { archiveLead, getArchiveStats, LEADS_PATH } = require('./src/archive');
const { upsertLead } = require('./src/sheetsSync');
const { logger } = require('./src/logger');

// ─── Startup validation ───────────────────────────────────────────────────────
const errors = validate();
if (errors.length > 0) {
  logger.error('Configuration errors found:');
  errors.forEach(e => logger.error(`  • ${e}`));
  logger.error('Copy .env.example to .env and fill in your credentials.');
  process.exit(1);
}

// ─── Banner ───────────────────────────────────────────────────────────────────
logger.box('Stratefai Whale Lead Engine — Phase 1');
logger.info(`Monitoring ${config.targetContracts.length} contract(s)`);
logger.info(`Min balance filter: ${config.minEthBalance} ETH`);
logger.info(`Poll interval: ${config.pollIntervalMs / 1000}s`);
logger.info(`Output file: ${LEADS_PATH}`);
logger.info(`Identity API: ${config.neynarApiKey ? 'Neynar (Farcaster) ✓' : 'Web3.bio (ENS)'}`);
logger.info(`Enrichment:  ${config.clayApiKey ? 'Clay ✓' : config.apolloApiKey ? 'Apollo ✓' : 'none'}`);
logger.info(`Google Sheets: ${config.googleSheetId ? '✓ Syncing to ' + config.googleSheetId : '✗ Not configured (set GOOGLE_SHEET_ID)'}`);
console.log('');

// ─── Recursive self-healing loop ─────────────────────────────────────────────
let lastScannedBlock = null;

async function tick() {
  try {
    const latestBlock = await getLatestBlock();

    if (lastScannedBlock === null) {
      // First run: scan the most recent block range
      lastScannedBlock = latestBlock - config.blockRange;
    }

    const fromBlock = lastScannedBlock + 1;
    const toBlock   = Math.min(fromBlock + config.blockRange - 1, latestBlock);

    if (fromBlock > latestBlock) {
      logger.info('No new blocks yet — waiting...');
      return;
    }

    logger.info(`━━━ Tick | blocks ${fromBlock} → ${toBlock} ━━━`);

    // Task 1: Whale Hunter
    const whales = await runWhaleHunter(fromBlock, toBlock, logger);
    logger.success(`Task 1 complete — ${whales.length} whale wallet(s) found`);

    // Task 2 + 3: Resolve and enrich each whale
    for (const whale of whales) {
      logger.info(`\n  🐋 Processing ${whale.address} (${whale.ethBalance.toFixed(4)} ETH)`);

      // Identity resolution
      const identity = await resolveIdentity(whale.address, logger);
      await sleep(300); // polite rate-limiting

      // Scrape for Telegram
      const telegramHandle = await scrapeBiosForTelegram(identity);
      if (telegramHandle) {
        logger.info(`   ✈️  Extracted Telegram from bio: @${telegramHandle}`);
      }

      // Archive to JSON
      const lead  = { ...whale, identity };
      const isNew = archiveLead(lead);
      logger.success(`  📁 Lead ${isNew ? 'added' : 'updated'} in archive`);

      // Sync to Google Sheets
      await upsertLead({
        address:          whale.address,
        ethBalance:       whale.ethBalance,
        sourceContract:   whale.sourceContract,
        ensName:          identity?.ensName,
        displayName:      identity?.displayName,
        farcasterHandle:  identity?.farcasterHandle,
        farcasterFid:     identity?.farcasterFid,
        lensHandle:       identity?.lensHandle,
        twitterHandle:    identity?.twitterHandle,
        instagramHandle:  identity?.instagramHandle,
        openSeaUsername:  identity?.openSeaUsername,
        website:          identity?.website,
        bio:              identity?.bio,
        avatar:           identity?.avatar,
        fullName:         null,
        emailAddress:     null,
        whatsappNumber:   null,
        telegramHandle:   telegramHandle,
        linkedinUrl:      null,
        enrichmentSource: telegramHandle ? 'Bio Scraper' : null,
        tags:             lead.tags,
      }, logger);

      // Send Telegram Alert
      if (config.telegramBotToken && config.telegramChatId) {
        await sendTelegramAlert(config.telegramBotToken, config.telegramChatId, whale, identity, telegramHandle);
      }
    }

    // Stats
    const stats = getArchiveStats();
    logger.info(`\n📊 Archive: ${stats.total} total leads | Last updated: ${stats.lastUpdated}`);

    lastScannedBlock = toBlock;

  } catch (err) {
    // Self-healing: log error but never crash the loop
    logger.error(`Loop error (will retry): ${err.message}`);
    if (process.env.DEBUG) console.error(err);
  }
}

async function main() {
  await tick(); // Run immediately on start
  setInterval(tick, config.pollIntervalMs);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
