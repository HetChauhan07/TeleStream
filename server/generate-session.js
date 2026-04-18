import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import readline from 'readline';

const API_ID = 30173317;
const API_HASH = '8c13ed182ff14c1594b18246f4e452c6';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

(async () => {
  console.log('\nTeleStream -- Telegram Session Generator\n');
  
  const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await ask('Enter your phone number (with country code, e.g. +91...): '),
    password: async () => await ask('Enter your 2FA password (if enabled, or press Enter): '),
    phoneCode: async () => await ask('Enter the code Telegram sent you: '),
    onError: (err) => console.error('Error:', err),
  });

  const session = client.session.save();
  
  console.log('\nSession generated successfully!\n');
  console.log('═══════════════════════════════════════════════════');
  console.log('Copy this ENTIRE string and paste it as TELEGRAM_SESSION in your .env file:\n');
  console.log(session);
  console.log('\n═══════════════════════════════════════════════════\n');

  rl.close();
  process.exit(0);
})();
