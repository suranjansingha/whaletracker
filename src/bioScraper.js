const axios = require('axios');

/**
 * Extracts a Telegram handle from a block of text using Regex.
 * Looks for t.me/username, tg: @username, telegram: username, etc.
 */
function extractTelegramHandle(text) {
  if (!text) return null;
  // Regex to match t.me/xyz, telegram: @xyz, tg: @xyz
  // Handle can be 5-32 chars, a-z, 0-9, and underscores
  const regex = /(?:t\.me\/|telegram:\s*@?|tg:\s*@?)(?<handle>[a-zA-Z0-9_]{5,32})/i;
  const match = text.match(regex);
  return match?.groups?.handle || null;
}

/**
 * Silently fetches Twitter bio using the syndication API
 */
async function scrapeTwitterBio(handle) {
  if (!handle) return null;
  try {
    const { data } = await axios.get(
      `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`,
      { timeout: 8000 }
    );
    // The response is HTML containing a JSON blob inside a <script id="__NEXT_DATA__">
    const match = data.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
    if (match && match[1]) {
      const json = JSON.parse(match[1]);
      // Navigate to the user description
      // It's buried in props.pageProps.rawTimelineEntry.content.tweet... we can just do a regex search on the JSON string for the description
      const userMatch = match[1].match(/"description":"([^"]+)"/);
      if (userMatch && userMatch[1]) {
        // Unescape JSON string
        return JSON.parse(`"${userMatch[1]}"`);
      }
    }
  } catch (err) {
    // Silently fail if blocked or rate limited
  }
  return null;
}

/**
 * Merges bios from all sources and extracts contact info
 */
async function scrapeBiosForTelegram(identity) {
  if (!identity) return null;
  let combinedBio = '';

  // 1. Add existing bio from Neynar/OpenSea/Web3Bio if it exists
  if (identity.bio) {
    combinedBio += identity.bio + ' ';
  }

  // 2. Try scraping Twitter if we found a handle
  if (identity.twitterHandle) {
    const twitterBio = await scrapeTwitterBio(identity.twitterHandle);
    if (twitterBio) {
      combinedBio += twitterBio + ' ';
      identity.bio = identity.bio ? `${identity.bio} | ${twitterBio}` : twitterBio; // Update the identity bio to include Twitter
    }
  }

  // Extract Telegram!
  const telegram = extractTelegramHandle(combinedBio);
  return telegram;
}

module.exports = { scrapeBiosForTelegram };
