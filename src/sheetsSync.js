'use strict';
/**
 * Google Sheets Sync
 *
 * Upserts whale leads into a Google Sheet in real time.
 *
 * Setup (one-time, ~5 mins):
 *   1. Go to https://console.cloud.google.com/
 *   2. Create a project → Enable "Google Sheets API"
 *   3. IAM & Admin → Service Accounts → Create Service Account
 *   4. Click the account → Keys → Add Key → JSON → Download
 *   5. Save the JSON file as: credentials/google-service-account.json
 *   6. Create a Google Sheet, copy its ID from the URL:
 *      https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
 *   7. Share the sheet with the service account email (Editor access)
 *   8. Set GOOGLE_SHEET_ID in .env
 */

const { google } = require('googleapis');
const path       = require('path');
const fs         = require('fs');
const { config } = require('./config');

const SCOPES      = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDS_PATH  = path.resolve(__dirname, '..', 'credentials', 'google-service-account.json');
const SHEET_NAME  = 'Whale Leads';

// Column headers — order matters, must match rowFromLead()
const HEADERS = [
  'Address',
  'ETH Balance',
  'Source Contract',
  'ENS Name',
  'Display Name',
  'Farcaster Handle',
  'Farcaster FID',
  'Lens Handle',
  'Twitter/X Handle',
  'Instagram Handle',
  'OpenSea Username',
  'Website',
  'Bio',
  'Avatar URL',
  'Identity Source',
  'Full Name',
  'Email Address',
  'WhatsApp Number',
  'Telegram Handle',
  'LinkedIn URL',
  'Enrichment Source',
  'Tags',
  'First Seen',
  'Last Updated',
];

// ─── Auth — supports file (local) OR base64 env var (Railway/cloud) ─────────
function getAuth() {
  let creds;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_B64) {
    // Railway / cloud: credentials stored as base64 env var
    creds = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')
    );
  } else if (fs.existsSync(CREDS_PATH)) {
    // Local dev: credentials file on disk
    creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  } else {
    throw new Error(
      `No Google credentials found.\n` +
      `  Local:   add credentials/google-service-account.json\n` +
      `  Railway: set GOOGLE_SERVICE_ACCOUNT_B64 env var`
    );
  }

  return new google.auth.GoogleAuth({ credentials: creds, scopes: SCOPES });
}

// ─── Get or create the sheet tab, always refresh headers ─────────────────────
async function ensureSheet(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets.find(
    s => s.properties.title === SHEET_NAME
  );

  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
      },
    });
  }

  // Always write/refresh headers in row 1
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  });
}

// ─── Convert a lead to a sheet row ───────────────────────────────────────────
function rowFromLead(lead) {
  return [
    lead.address           || '',
    lead.ethBalance        ? lead.ethBalance.toFixed(4) : '',
    lead.sourceContract    || '',
    lead.ensName           || '',
    lead.displayName       || '',
    lead.farcasterHandle   || '',
    lead.farcasterFid      || '',
    lead.lensHandle        || '',
    lead.twitterHandle     || '',
    lead.instagramHandle   || '',
    lead.openSeaUsername   || '',
    lead.website           || '',
    lead.bio               || '',
    lead.avatar            || '',
    lead.identitySource    || '',
    lead.fullName          || '',
    lead.emailAddress      || '',
    lead.whatsappNumber    || '',
    lead.telegramHandle    || '',
    lead.linkedinUrl       || '',
    lead.enrichmentSource  || '',
    (lead.tags || []).join(' '),
    lead.firstSeen         || '',
    lead.lastUpdated       || '',
  ];
}

// ─── Upsert a single lead (update existing row or append new) ─────────────────
async function upsertLead(lead, logger) {
  if (!config.googleSheetId) {
    logger.warn('   📊 GOOGLE_SHEET_ID not set — skipping Sheets sync');
    return;
  }

  try {
    const auth        = getAuth();
    const sheets      = google.sheets({ version: 'v4', auth });
    const spreadsheetId = config.googleSheetId;

    await ensureSheet(sheets, spreadsheetId);

    // Fetch all existing addresses (column A)
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A:A`,
    });

    const rows      = existing.data.values || [];
    const addresses = rows.map(r => (r[0] || '').toLowerCase());
    const rowIndex  = addresses.indexOf(lead.address.toLowerCase());

    const newRow = rowFromLead(lead);

    if (rowIndex > 0) {
      // Update existing row (rowIndex is 0-based, sheet is 1-based, +1 for header)
      const sheetRow = rowIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [newRow] },
      });
      logger.success(`   📊 Sheets: updated row ${sheetRow} for ${lead.address}`);
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [newRow] },
      });
      logger.success(`   📊 Sheets: appended new lead ${lead.address}`);
    }
  } catch (err) {
    logger.error(`   📊 Sheets sync failed: ${err.message}`);
  }
}

// ─── Full sync: push entire archive to sheet ──────────────────────────────────
async function syncAllLeads(leads, logger) {
  logger.info(`📊 Syncing ${leads.length} leads to Google Sheets...`);
  for (const lead of leads) {
    await upsertLead(lead, logger);
  }
  logger.success('📊 Full sync complete');
}

module.exports = { upsertLead, syncAllLeads };
