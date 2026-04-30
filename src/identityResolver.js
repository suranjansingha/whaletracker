'use strict';
/**
 * Task 2: The Identity Resolver
 *
 * Maps 0x wallet addresses to social handles — waterfall order:
 *
 *   1. Neynar API    — Farcaster username, FID, pfp, bio from address
 *                      https://api.neynar.com  (free tier key required)
 *
 *   2. Web3.bio      — ENS + Farcaster + Lens + X aggregated
 *                      https://api.web3.bio/profile/{address}  (no key)
 *
 *   3. ENSData       — ENS name only
 *                      https://ensdata.net/{address}           (no key)
 *
 *   4. ENS Subgraph  — last resort ENS lookup via The Graph    (no key)
 */

const axios  = require('axios');
const { config } = require('./config');
const { resolveViaOpenSea } = require('./openSeaResolver');

// ─── 1. Neynar — Farcaster lookup by connected wallet address ──────────────
// Docs: https://docs.neynar.com/reference/fetch-bulk-users-by-ethereum-address
async function resolveViaNeynar(address) {
  if (!config.neynarApiKey) return null;

  // Add a small delay to prevent Neynar free tier rate limiting (429)
  await new Promise(r => setTimeout(r, 1000));

  const { data } = await axios.get(
    'https://api.neynar.com/v2/farcaster/user/bulk-by-address',
    {
      params: { addresses: address.toLowerCase() },
      headers: { api_key: config.neynarApiKey },
      timeout: 10000,
    }
  );

  // Response shape: { [address]: [user, ...] }
  const users = data?.[address.toLowerCase()] || [];
  if (users.length === 0) return null;

  const user = users[0];
  return {
    source:           'Neynar',
    farcasterHandle:  user.username   || null,
    farcasterFid:     user.fid        || null,
    displayName:      user.display_name || null,
    avatar:           user.pfp_url    || null,
    bio:              user.profile?.bio?.text || null,
    ensName:          null,  // Neynar doesn’t resolve ENS
    twitterHandle:    null,
    lensHandle:       null,
  };
}


// ─── 1. Web3.bio — best free option (multi-platform) ─────────────────────────
// Returns: ENS name, Farcaster handle, Lens handle, X handle, avatar, etc.
// Docs:    https://web3.bio/
async function resolveViaWeb3Bio(address) {
  const { data } = await axios.get(
    `https://api.web3.bio/profile/${address.toLowerCase()}`,
    { timeout: 10000 }
  );

  if (!Array.isArray(data) || data.length === 0) return null;

  // web3.bio returns an array — one entry per platform
  const result = {
    source: 'Web3.bio',
    ensName:          null,
    farcasterHandle:  null,
    lensHandle:       null,
    twitterHandle:    null,
    displayName:      null,
    avatar:           null,
  };

  for (const profile of data) {
    result.displayName = result.displayName || profile.displayName;
    result.avatar      = result.avatar      || profile.avatar;

    switch (profile.platform) {
      case 'ens':       result.ensName         = profile.identity; break;
      case 'farcaster': result.farcasterHandle = profile.identity; break;
      case 'lens':      result.lensHandle      = profile.identity; break;
      case 'twitter':   result.twitterHandle   = profile.identity; break;
    }

    // Also pull X/Twitter from nested links if present
    if (profile.links?.twitter?.handle) {
      result.twitterHandle = result.twitterHandle || profile.links.twitter.handle;
    }
  }

  return result;
}

// ─── 2. ENSData — simple ENS-only fallback ────────────────────────────────────
// Docs: https://ensdata.net/
async function resolveViaENSData(address) {
  const { data } = await axios.get(
    `https://ensdata.net/${address.toLowerCase()}`,
    { timeout: 8000 }
  );

  if (!data?.ens_primary && !data?.ens) return null;

  return {
    source:           'ENSData',
    ensName:          data.ens_primary || data.ens || null,
    farcasterHandle:  null,
    lensHandle:       null,
    twitterHandle:    null,
    displayName:      data.ens_primary || data.ens || null,
    avatar:           null,
  };
}

// ─── 3. ENS Subgraph — last resort ────────────────────────────────────────────
async function resolveViaENSSubgraph(address) {
  const query = `{
    domains(where: { resolvedAddress: "${address.toLowerCase()}" }) {
      name
      owner { id }
    }
  }`;

  const { data } = await axios.post(
    'https://api.thegraph.com/subgraphs/name/ensdomains/ens',
    { query },
    { timeout: 10000 }
  );

  const domains = data?.data?.domains || [];
  if (domains.length === 0) return null;

  return {
    source:           'ENS Subgraph',
    ensName:          domains[0].name,
    farcasterHandle:  null,
    lensHandle:       null,
    twitterHandle:    null,
    displayName:      domains[0].name,
    avatar:           null,
  };
}

// ─── Main resolver — waterfall: Neynar → OpenSea → Web3.bio → ENSData → ENS Subgraph ──
async function resolveIdentity(address, logger) {
  let result = null;

  // 1. Neynar (Farcaster: username, FID, pfp, bio)
  if (config.neynarApiKey) {
    try {
      result = await resolveViaNeynar(address);
      if (result) {
        logger.info(
          `   🧐 [Neynar] @${result.farcasterHandle} | ` +
          `FID: ${result.farcasterFid} | ` +
          `Name: ${result.displayName || '—'}`
        );
      }
    } catch (err) {
      logger.warn(`   ⚡ Neynar failed (${err.message}) → continuing`);
    }
  }

  // 2. OpenSea (Twitter, Instagram, website, username)
  if (config.openSeaApiKey) {
    try {
      const osResult = await resolveViaOpenSea(address);
      if (osResult) {
        logger.info(
          `   🏔️  [OpenSea] @${osResult.openSeaUsername || '—'} | ` +
          `Twitter: ${osResult.twitterHandle || '—'} | ` +
          `Instagram: ${osResult.instagramHandle || '—'} | ` +
          `Site: ${osResult.website || '—'}`
        );
        // Merge with Neynar result (keep both Farcaster + Twitter)
        if (result) {
          result.twitterHandle   = result.twitterHandle   || osResult.twitterHandle;
          result.instagramHandle = osResult.instagramHandle;
          result.openSeaUsername = osResult.openSeaUsername;
          result.website         = osResult.website;
          result.avatar          = result.avatar          || osResult.avatar;
          result.displayName     = result.displayName     || osResult.displayName;
        } else {
          result = osResult;
        }
      }
    } catch (err) {
      logger.warn(`   ⚡ OpenSea failed (${err.message}) → continuing`);
    }
  }

  // Return early if we have good data from Neynar + OpenSea
  if (result?.farcasterHandle || result?.twitterHandle) {
    // Still try to supplement ENS name silently
    try {
      const web3 = await resolveViaWeb3Bio(address);
      if (web3?.ensName) result.ensName = web3.ensName;
    } catch { /* bonus */ }
    return result;
  }

  // 3. Web3.bio (ENS + Farcaster + Lens + X, no key)
  try {
    const web3Result = await resolveViaWeb3Bio(address);
    if (web3Result) {
      logger.info(
        `   🢪  [Web3.bio] ENS: ${web3Result.ensName || '—'} | ` +
        `Farcaster: ${web3Result.farcasterHandle || '—'} | ` +
        `Lens: ${web3Result.lensHandle || '—'} | ` +
        `X: ${web3Result.twitterHandle || '—'}`
      );
      // Merge with any existing result
      return result ? { ...result, ...web3Result } : web3Result;
    }
  } catch (err) {
    logger.warn(`   ⚡ Web3.bio failed (${err.message}) → trying ENSData`);
  }

  // If we have partial data from Neynar/OpenSea, return it
  if (result) return result;

  // 4. ENSData (ENS name only)
  try {
    const ensResult = await resolveViaENSData(address);
    if (ensResult) {
      logger.info(`   🢪  [ENSData] ENS: ${ensResult.ensName}`);
      return ensResult;
    }
  } catch (err) {
    logger.warn(`   ⚡ ENSData failed (${err.message}) → trying ENS Subgraph`);
  }

  // 5. ENS Subgraph (last resort)
  try {
    const sgResult = await resolveViaENSSubgraph(address);
    if (sgResult) {
      logger.info(`   🢪  [ENS Subgraph] ENS: ${sgResult.ensName}`);
      return sgResult;
    }
  } catch (err) {
    logger.warn(`   ⚡ ENS Subgraph failed (${err.message})`);
  }

  logger.info(`   🢪  ${address} → no identity resolved`);
  return {
    source: 'unresolved',
    ensName: null, farcasterHandle: null, farcasterFid: null,
    lensHandle: null, twitterHandle: null, instagramHandle: null,
    openSeaUsername: null, website: null,
    displayName: null, avatar: null, bio: null,
  };
}

module.exports = { resolveIdentity };
