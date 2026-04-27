/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const mode = process.argv[2]; // "phone" | "emu"
if (!mode || !['phone', 'emu'].includes(mode)) {
  die('Usage: node scripts/switch-env.js <phone|emu>');
}

const root = path.resolve(__dirname, '..');
const src = path.join(root, `.env.${mode}`);
const dst = path.join(root, '.env');

if (!fs.existsSync(src)) {
  die(
    `Missing ${path.relative(root, src)}.\n` +
      `Create it by copying ${path.relative(root, path.join(root, '.env.example'))} and adjusting EXPO_PUBLIC_API_BASE_URL.`
  );
}

fs.copyFileSync(src, dst);
console.log(`Switched .env → ${path.basename(src)}`);

