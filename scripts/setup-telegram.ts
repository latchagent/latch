import "dotenv/config";

/**
 * Set up Telegram webhook based on environment
 * 
 * Usage:
 *   npx tsx scripts/setup-telegram.ts
 *   npx tsx scripts/setup-telegram.ts https://custom-url.com
 */

async function setupTelegramWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN not set in .env");
    process.exit(1);
  }

  // Use custom URL from args, or fall back to env
  const customUrl = process.argv[2];
  const baseUrl = customUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const webhookUrl = `${baseUrl}/api/telegram/webhook`;

  console.log(`\n🤖 Setting up Telegram webhook...\n`);
  console.log(`   Bot token: ${token.slice(0, 10)}...`);
  console.log(`   Webhook URL: ${webhookUrl}\n`);

  // Set the webhook
  const setResponse = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
  );
  const setResult = await setResponse.json();

  if (setResult.ok) {
    console.log(`✅ Webhook set successfully!\n`);
  } else {
    console.error(`❌ Failed to set webhook:`, setResult);
    process.exit(1);
  }

  // Verify
  const infoResponse = await fetch(
    `https://api.telegram.org/bot${token}/getWebhookInfo`
  );
  const infoResult = await infoResponse.json();

  console.log(`📋 Webhook info:`);
  console.log(`   URL: ${infoResult.result.url}`);
  console.log(`   Pending updates: ${infoResult.result.pending_update_count}`);
  if (infoResult.result.last_error_message) {
    console.log(`   ⚠️  Last error: ${infoResult.result.last_error_message}`);
  }

  console.log(`\n🎉 Done! Your bot is ready.\n`);
  console.log(`Next steps:`);
  console.log(`   1. Go to Settings in your Latch dashboard`);
  console.log(`   2. Click "Connect Telegram"`);
  console.log(`   3. Press Start in the Telegram bot\n`);
}

setupTelegramWebhook().catch(console.error);
