'use strict';
/**
 * OpenSea Identity Resolver
 *
 * Calls GET /api/v2/accounts/{address} to extract:
 *   - OpenSea username
 *   - Twitter / Instagram / website from social_media_accounts[]
 *   - Profile image & banner
 *
 * Docs: https://docs.opensea.io/reference/get_account
 * Rate limit: 60 reads/min on free tier
 */

const axios = require('axios');
const { config } = require('./config');

async function resolveViaOpenSea(address) {
  if (!config.openSeaApiKey) return null;

  const { data } = await axios.get(
    `https://api.opensea.io/api/v2/accounts/${address.toLowerCase()}`,
    {
      headers: { 'x-api-key': config.openSeaApiKey },
      timeout: 10000,
    }
  );

  // No OpenSea profile found
  if (!data || (!data.username && !data.social_media_accounts?.length)) {
    return null;
  }

  // Parse social_media_accounts array
  // e.g. [{ platform: "twitter", username: "vitalik" }, { platform: "instagram", username: "..." }]
  const socials = {};
  for (const account of (data.social_media_accounts || [])) {
    if (account.platform && account.username) {
      socials[account.platform.toLowerCase()] = account.username;
    }
  }

  return {
    source:           'OpenSea',
    openSeaUsername:  data.username         || null,
    twitterHandle:    socials.twitter       || null,
    instagramHandle:  socials.instagram     || null,
    website:          data.website          || socials.website || null,
    avatar:           data.profile_image_url || null,
    banner:           data.banner_image_url  || null,
    displayName:      data.username         || null,
    // Fields OpenSea doesn't provide — will be filled by other resolvers
    ensName:          null,
    farcasterHandle:  null,
    farcasterFid:     null,
    lensHandle:       null,
    bio:              null,
  };
}

module.exports = { resolveViaOpenSea };
