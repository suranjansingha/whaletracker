'use strict';
/**
 * Task 3: The Waterfall Enrichment
 *
 * Enriches a resolved social identity with additional metadata.
 *   Primary:  Clay People API (if CLAY_API_KEY set)
 *   Secondary: Apollo.io API (if APOLLO_API_KEY set)
 *   Fallback: None — no scraping; log as "enrichment_unavailable"
 *
 * Note: Telegram handle resolution requires a paid enrichment API
 * (Clay/Apollo) as there is no public, ToS-compliant free endpoint.
 */

const axios = require('axios');
const { config } = require('./config');



// ─── Apollo.io API ────────────────────────────────────────────────────────────
// Docs: https://apolloio.github.io/apollo-api-docs/
async function enrichViaApollo(twitterHandle) {
  if (!config.apolloApiKey || !twitterHandle) return null;

  try {
    const { data } = await axios.post(
      'https://api.apollo.io/v1/people/match',
      { twitter_url: `https://twitter.com/${twitterHandle}` },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': config.apolloApiKey,
        },
        timeout: 12000,
      }
    );

    const person = data?.person;
    if (!person) return null;

    return {
      source: 'Apollo',
      fullName:       person.name || null,
      emailAddress:   person.email || person.personal_emails?.[0] || null,
      whatsappNumber: null, // Apollo rarely exposes personal WhatsApp
      telegramHandle: null, // Apollo doesn't surface Telegram
      farcasterFid:   null,
      linkedinUrl:    person.linkedin_url || null,
      enrichedAt:     new Date().toISOString(),
    };
  } catch (err) {
    throw new Error(`Apollo error: ${err.response?.data?.message || err.message}`);
  }
}

// ─── Main enrichment waterfall ────────────────────────────────────────────────
async function enrichLead(identity, logger) {
  const handle = identity?.twitterHandle;

  // Try Apollo
  try {
    const result = await enrichViaApollo(handle);
    if (result) {
      logger.info(`   ✨ Enriched via Apollo: LinkedIn=${result.linkedinUrl || '—'}`);
      return result;
    }
  } catch (err) {
    logger.warn(`   ⚡ Apollo failed (${err.message})`);
  }

  // No enrichment available
  logger.info('   ✨ No enrichment API available — skipping enrichment step');
  return {
    source: 'enrichment_unavailable',
    fullName: null,
    emailAddress: null,
    whatsappNumber: null,
    telegramHandle: null,
    farcasterFid: null,
    linkedinUrl: null,
    enrichedAt: new Date().toISOString(),
  };
}

module.exports = { enrichLead };
