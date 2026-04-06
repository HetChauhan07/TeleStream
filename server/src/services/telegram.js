import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import readline from 'readline';

let client = null;

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function initTelegram() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const sessionStr = process.env.TELEGRAM_SESSION || '';

  if (!apiId || !apiHash) {
    throw new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH are required in .env');
  }

  const session = new StringSession(sessionStr);

  client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false,
  });

  // If no session saved, do interactive login
  if (!sessionStr) {
    console.log('\n🔐 First-time Telegram login required...');
    await client.start({
      phoneNumber: async () => await prompt('📱 Enter your phone number: '),
      password: async () => await prompt('🔑 Enter your 2FA password (or press Enter): '),
      phoneCode: async () => await prompt('💬 Enter the code you received: '),
      onError: (err) => console.error('Auth error:', err),
    });

    // Save session string — user should copy this to .env
    const savedSession = client.session.save();
    console.log('\n✅ Logged in! Copy this session string to your .env file:');
    console.log(`TELEGRAM_SESSION=${savedSession}\n`);
  } else {
    await client.connect();
  }

  console.log('✅ Telegram client connected');
  return client;
}

export function getTelegramClient() {
  if (!client) {
    throw new Error('Telegram client not initialized. Call initTelegram() first.');
  }
  return client;
}

/**
 * Uploads a local file to the specified Telegram channel.
 * @param {string} channelId - The ID or username of the channel
 * @param {string} filePath - Local absolute path to the file
 * @param {string} caption - The caption to set for the uploaded file
 */
export async function uploadFileToChannel(channelId, filePath, caption) {
  if (!client) {
    throw new Error('Telegram client not initialized.');
  }
  
  console.log(`📤 Uploading file to Telegram: ${caption}`);

  const result = await client.sendFile(channelId, {
    file: filePath,
    caption: caption,
    forceDocument: true, // Send as document to avoid compression
  });

  console.log(`✅ Upload successful: message ID ${result.id}`);
  return result;
}

export { NewMessage };
