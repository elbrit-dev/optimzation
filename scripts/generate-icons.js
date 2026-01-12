/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('sharp is not installed yet; skip icon generation.');
  process.exit(0);
}

const projectRoot = process.cwd();
const publicDir = path.join(projectRoot, 'public');

const candidates = [
  path.join(publicDir, 'logo.svg'),
  path.join(publicDir, 'icon.png'),
  path.join(publicDir, 'icon.jpg'),
  path.join(publicDir, 'favicon.jpg'),
  path.join(publicDir, 'favicon.png')
];

const sourcePath = candidates.find((p) => fs.existsSync(p));

if (!sourcePath) {
  console.warn('No source icon found (looked for public/logo.svg, icon.png, icon.jpg, favicon.jpg, favicon.png).');
  process.exit(0);
}

const targets = [
  { out: 'logo-192.svg', size: 192 },
  { out: 'logo-512.svg', size: 512 },
  { out: 'apple-touch-icon.png', size: 180 }
];

(async () => {
  try {
    await Promise.all(
      targets.map(({ out, size }) =>
        sharp(sourcePath)
          .resize(size, size, { fit: 'cover' })
          .png()
          .toFile(path.join(publicDir, out))
      )
    );
    console.log('Generated PWA icons:', targets.map(t => t.out).join(', '));
  } catch (err) {
    console.error('Failed to generate icons:', err);
    process.exit(1);
  }
})();


