const fs = require('fs');
const path = require('path');
const { generateImageAsync } = require('@expo/image-utils');

// Android Notification Icon specs:
// - Must be pure white (#FFFFFF) foreground on transparent background
// - Large & prominent (filling 85% of canvas) so it is crisp and clearly identifiable on the status bar
const NOTIF_SIZES = [
  { folder: 'drawable-mdpi', size: 24 },
  { folder: 'drawable-hdpi', size: 36 },
  { folder: 'drawable-xhdpi', size: 48 },
  { folder: 'drawable-xxhdpi', size: 72 },
  { folder: 'drawable-xxxhdpi', size: 96 },
];

const TARGET_RES_DIRS = [
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res'),
  'C:\\SpendFlow\\android\\app\\src\\main\\res',
];

// Bold, high-contrast pure white (#FFFFFF) SpendFlow S-monogram & Wallet silhouette on transparent background
const notifSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <!-- Outer Card Body with rounded corners -->
  <path d="M12 20 C12 13.5 17.5 8 24 8 L72 8 C78.5 8 84 13.5 84 20 L84 76 C84 82.5 78.5 88 72 88 L24 88 C17.5 88 12 82.5 12 76 Z" fill="#FFFFFF"/>
  <!-- Transparent Cutout 1: Magnetic stripe / upper accent -->
  <rect x="20" y="18" width="56" height="10" rx="3" fill="#000000"/>
  <!-- Transparent Cutout 2: Bold Dynamic S-Curve / Growth Flow -->
  <path d="M66 40 C66 35 60 32 50 32 C38 32 32 37 32 44 C32 58 64 54 64 66 C64 72 58 75 48 75 C36 75 30 70 30 64 L40 64 C40 67 43 68 48 68 C53 68 56 66 56 63 C56 52 24 55 24 41 C24 33 32 26 48 26 C62 26 74 33 74 40 Z" fill="#000000"/>
</svg>`;

// Also a pure silhouette version with no black cutouts (pure white paths with transparent gaps)
const pureSilhouetteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <!-- Top Bar -->
  <path d="M22 14 C16.5 14 12 18.5 12 24 L12 28 L84 28 L84 24 C84 18.5 79.5 14 74 14 Z" fill="#FFFFFF"/>
  <!-- Main Card Body -->
  <path d="M12 36 L12 72 C12 77.5 16.5 82 22 82 L74 82 C79.5 82 84 77.5 84 72 L84 36 Z" fill="#FFFFFF"/>
  <!-- Inner Cutout for Wallet Lock / Chip Accent (transparent via mask or path geometry) -->
</svg>`;

// The cleanest, sharpest Android status bar icon: A bold geometric SpendFlow "S" emblem with a spark in pure white
const spendflowEmblemSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <!-- Bold SpendFlow Geometric Icon in Pure White on 100% Transparent Canvas -->
  <!-- Top curve of S -->
  <path d="M68 12 L36 12 C22.7 12 12 22.7 12 36 C12 49.3 22.7 60 36 60 L60 60 C66.6 60 72 65.4 72 72 C72 78.6 66.6 84 60 84 L24 84 C20.7 84 18 81.3 18 78 L18 76 L8 76 L8 78 C8 86.8 15.2 94 24 94 L60 94 C72.2 94 82 84.2 82 72 C82 59.8 72.2 50 60 50 L36 50 C29.4 50 24 44.6 24 38 C24 31.4 29.4 26 36 26 L68 26 C71.3 26 74 28.7 74 32 L74 34 L84 34 L84 32 C84 23.2 76.8 12 68 12 Z" fill="#FFFFFF"/>
  <!-- Spark / Star in top-right -->
  <path d="M78 8 L81 18 L91 21 L81 24 L78 34 L75 24 L65 21 L75 18 Z" fill="#FFFFFF"/>
</svg>`;

async function main() {
  console.log('Generating crisp white Android notification icons...');
  const svgPath = path.join(__dirname, 'notif_temp.svg');
  fs.writeFileSync(svgPath, spendflowEmblemSvg);

  for (const targetRes of TARGET_RES_DIRS) {
    if (!fs.existsSync(targetRes)) continue;
    console.log(`Updating notification icons in ${targetRes}...`);

    for (const item of NOTIF_SIZES) {
      const folderPath = path.join(targetRes, item.folder);
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

      const img = await generateImageAsync(
        { projectRoot: path.join(__dirname, '..') },
        {
          src: svgPath,
          width: item.size,
          height: item.size,
          resizeMode: 'contain',
          format: 'png',
        }
      );

      const dest = path.join(folderPath, 'notification_icon.png');
      fs.writeFileSync(dest, img.source);
      console.log(`  ✓ Wrote ${item.size}x${item.size} to ${dest}`);
    }
  }

  // Update assets/android-icon-monochrome.png
  const monoImg = await generateImageAsync(
    { projectRoot: path.join(__dirname, '..') },
    {
      src: svgPath,
      width: 96,
      height: 96,
      resizeMode: 'contain',
      format: 'png',
    }
  );
  fs.writeFileSync(path.join(__dirname, '..', 'assets', 'android-icon-monochrome.png'), monoImg.source);
  console.log('  ✓ Updated assets/android-icon-monochrome.png');

  try {
    fs.unlinkSync(svgPath);
  } catch {}

  console.log('🎉 Notification icon generation complete!');
}

main().catch(err => {
  console.error('Failed to generate notification icons:', err);
  process.exit(1);
});
