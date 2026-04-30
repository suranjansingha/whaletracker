'use strict';
/**
 * Lead Archive
 *
 * Persists enriched whale leads to whale_leads.json.
 * Deduplicates by wallet address (upsert behaviour).
 */

const fs   = require('fs');
const path = require('path');

const LEADS_PATH = path.resolve(__dirname, '..', 'whale_leads.json');

function loadArchive() {
  if (!fs.existsSync(LEADS_PATH)) return { leads: [], meta: { lastUpdated: null, total: 0 } };
  try {
    return JSON.parse(fs.readFileSync(LEADS_PATH, 'utf8'));
  } catch {
    return { leads: [], meta: { lastUpdated: null, total: 0 } };
  }
}

function saveArchive(archive) {
  archive.meta.lastUpdated = new Date().toISOString();
  archive.meta.total = archive.leads.length;
  fs.writeFileSync(LEADS_PATH, JSON.stringify(archive, null, 2), 'utf8');
}

/**
 * Upsert a lead into the archive.
 * Returns true if it was a new lead, false if updated.
 */
function archiveLead(lead) {
  const archive = loadArchive();
  const idx = archive.leads.findIndex(l => l.address === lead.address);

  const record = {
    // Core identity
    address:        lead.address,
    ethBalance:     lead.ethBalance,
    sourceContract: lead.sourceContract,

    // Identity resolution
    ensName:          lead.identity?.ensName || null,
    displayName:      lead.identity?.displayName || null,
    twitterHandle:    lead.identity?.twitterHandle || null,
    farcasterHandle:  lead.identity?.farcasterHandle || null,
    lensHandle:       lead.identity?.lensHandle || null,
    avatar:           lead.identity?.avatar || null,
    identitySource:   lead.identity?.source || null,

    // Enrichment
    fullName:       lead.enrichment?.fullName || null,
    telegramHandle: lead.enrichment?.telegramHandle || null,
    farcasterFid:   lead.enrichment?.farcasterFid || null,
    linkedinUrl:    lead.enrichment?.linkedinUrl || null,
    enrichmentSource: lead.enrichment?.source || null,

    // Metadata
    tags: ['#HighConvictionWhale', '#WealthAutomation', '#AlphaSignals'],
    firstSeen:  idx === -1 ? new Date().toISOString() : archive.leads[idx].firstSeen,
    lastUpdated: new Date().toISOString(),
  };

  if (idx === -1) {
    archive.leads.push(record);
    saveArchive(archive);
    return true; // new
  } else {
    archive.leads[idx] = record;
    saveArchive(archive);
    return false; // updated
  }
}

function getArchiveStats() {
  const archive = loadArchive();
  return archive.meta;
}

module.exports = { archiveLead, getArchiveStats, LEADS_PATH };
