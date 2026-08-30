const fs = require('fs');
const path = require('path');
const { generateImageAsync } = require('@expo/image-utils');

const MIPMAP_SIZES = [
  { folder: 'mipmap-mdpi', launcherSize: 48, foregroundSize: 108 },
  { folder: 'mipmap-hdpi', launcherSize: 72, foregroundSize: 162 },
  { folder: 'mipmap-xhdpi', launcherSize: 96, foregroundSize: 216 },
  { folder: 'mipmap-xxhdpi', launcherSize: 144, foregroundSize: 324 },
  { folder: 'mipmap-xxxhdpi', launcherSize: 192, foregroundSize: 432 },
];

const DRAWABLE_SIZES = [
  { folder: 'drawable-mdpi', notifSize: 24, splashWidth: 100, splashHeight: 100 },
  { folder: 'drawable-hdpi', notifSize: 36, splashWidth: 150, splashHeight: 150 },
  { folder: 'drawable-xhdpi', notifSize: 48, splashWidth: 200, splashHeight: 200 },
  { folder: 'drawable-xxhdpi', notifSize: 72, splashWidth: 300, splashHeight: 300 },
  { folder: 'drawable-xxxhdpi', notifSize: 96, splashWidth: 400, splashHeight: 400 },
];

const TARGET_DIRS = [
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res'),
  'C:\\SpendFlow\\android\\app\\src\\main\\res',
];

const iconSrc = path.join(__dirname, '..', 'assets', 'icon.png');
const foregroundSrc = path.join(__dirname, '..', 'assets', 'android-icon-foreground.png');
const splashSrc = path.join(__dirname, '..', 'assets', 'splash-icon.png');

async function run() {
  console.log('Generating Android launcher, adaptive, notification, and splash icons...');

  for (const targetRes of TARGET_DIRS) {
    if (!fs.existsSync(targetRes)) continue;
    console.log(`Processing resources in ${targetRes}...`);

    // 1. Mipmaps (App Launchers)
    for (const size of MIPMAP_SIZES) {
      const folderPath = path.join(targetRes, size.folder);
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

      const launcherWebp = await generateImageAsync(
        { projectRoot: path.join(__dirname, '..') },
        { src: iconSrc, width: size.launcherSize, height: size.launcherSize, resizeMode: 'cover', format: 'webp' }
      );
      fs.writeFileSync(path.join(folderPath, 'ic_launcher.webp'), launcherWebp.source);
      fs.writeFileSync(path.join(folderPath, 'ic_launcher_round.webp'), launcherWebp.source);

      const launcherPng = await generateImageAsync(
        { projectRoot: path.join(__dirname, '..') },
        { src: iconSrc, width: size.launcherSize, height: size.launcherSize, resizeMode: 'cover', format: 'png' }
      );
      fs.writeFileSync(path.join(folderPath, 'ic_launcher.png'), launcherPng.source);
      fs.writeFileSync(path.join(folderPath, 'ic_launcher_round.png'), launcherPng.source);

      const foregroundWebp = await generateImageAsync(
        { projectRoot: path.join(__dirname, '..') },
        { src: foregroundSrc, width: size.foregroundSize, height: size.foregroundSize, resizeMode: 'contain', format: 'webp' }
      );
      fs.writeFileSync(path.join(folderPath, 'ic_launcher_foreground.webp'), foregroundWebp.source);

      const foregroundPng = await generateImageAsync(
        { projectRoot: path.join(__dirname, '..') },
        { src: foregroundSrc, width: size.foregroundSize, height: size.foregroundSize, resizeMode: 'contain', format: 'png' }
      );
      fs.writeFileSync(path.join(folderPath, 'ic_launcher_foreground.png'), foregroundPng.source);
    }

    // 2. Drawables (Notifications & Splash)
    for (const size of DRAWABLE_SIZES) {
      const folderPath = path.join(targetRes, size.folder);
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

      // Notification icon (clean white monochrome silhouette for Android status bar)
      const notifPng = await generateImageAsync(
        { projectRoot: path.join(__dirname, '..') },
        { src: foregroundSrc, width: size.notifSize, height: size.notifSize, resizeMode: 'contain', format: 'png' }
      );
      fs.writeFileSync(path.join(folderPath, 'notification_icon.png'), notifPng.source);

      // Splashscreen logo
      const splashPng = await generateImageAsync(
        { projectRoot: path.join(__dirname, '..') },
        { src: splashSrc, width: size.splashWidth, height: size.splashHeight, resizeMode: 'contain', format: 'png' }
      );
      fs.writeFileSync(path.join(folderPath, 'splashscreen_logo.png'), splashPng.source);
    }
  }

  // Update assets/android-icon-monochrome.png for expo-notifications plugin
  const monoAsset = await generateImageAsync(
    { projectRoot: path.join(__dirname, '..') },
    { src: foregroundSrc, width: 96, height: 96, resizeMode: 'contain', format: 'png' }
  );
  fs.writeFileSync(path.join(__dirname, '..', 'assets', 'android-icon-monochrome.png'), monoAsset.source);

  console.log('✅ All launcher, adaptive, notification, and splash icons generated successfully!');
}

run().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
