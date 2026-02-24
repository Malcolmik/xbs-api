/**
 * One-time script: Generate real API keys for the seeded applications
 */
import { db } from '../src/config/database';
import { generateApiKey } from '../src/services/authService';

const APP_IDS = {
  taskflow: '11111111-1111-1111-1111-111111111111',
  payserve:  '22222222-2222-2222-2222-222222222222',
  edupro:    '33333333-3333-3333-3333-333333333333',
};

async function main() {
  console.log('Generating API keys...\n');

  for (const [name, appId] of Object.entries(APP_IDS)) {
    const skTest = await generateApiKey(appId, 'sk', 'test');
    const pkTest = await generateApiKey(appId, 'pk', 'test');
    const skLive = await generateApiKey(appId, 'sk', 'live');
    const pkLive = await generateApiKey(appId, 'pk', 'live');

    console.log(`=== ${name.toUpperCase()} ===`);
    console.log(`  sk_test: ${skTest.key}`);
    console.log(`  pk_test: ${pkTest.key}`);
    console.log(`  sk_live: ${skLive.key}`);
    console.log(`  pk_live: ${pkLive.key}`);
    console.log();
  }

  await db.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
