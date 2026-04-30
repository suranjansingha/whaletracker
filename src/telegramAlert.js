const axios = require('axios');

async function sendTelegramAlert(botToken, chatId, whale, identity, telegramHandle) {
  if (!botToken || !chatId) return;

  // Format money nicely
  const balanceStr = parseFloat(whale.ethBalance).toFixed(2);
  
  // Format socials
  const twitterStr = identity?.twitterHandle ? `[${identity.twitterHandle}](https://twitter.com/${identity.twitterHandle})` : '—';
  const instaStr   = identity?.instagramHandle ? `[${identity.instagramHandle}](https://instagram.com/${identity.instagramHandle})` : '—';
  const tgStr      = telegramHandle ? `[@${telegramHandle}](https://t.me/${telegramHandle})` : '—';

  const message = `
🚨 *NEW WHALE DETECTED* 🚨

💰 *Balance:* ${balanceStr} ETH
🏷️ *Name:* ${identity?.displayName || identity?.ensName || 'Unknown'}

🐦 *Twitter:* ${twitterStr}
📸 *Instagram:* ${instaStr}
✈️ *Telegram:* ${tgStr}

🔗 [Etherscan](https://etherscan.io/address/${whale.address})
  `.trim();

  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }, { timeout: 8000 });
  } catch (err) {
    console.error(`⚠️ Failed to send Telegram alert: ${err.message}`);
  }
}

module.exports = { sendTelegramAlert };
