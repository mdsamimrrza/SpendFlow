// Config plugin: restores every hand-applied native customization that the
// gitignored android/ tree used to lose on prebuild (audit 2026-10-27, A24):
//
//   1. Credential Manager password-save module — copies the tracked Java
//      sources from plugins/credential-manager-src/ into the app package,
//      injects the androidx.credentials gradle dependencies, and registers
//      CredentialManagerPackage in MainApplication.kt.
//   2. ML Kit install-time model download — re-adds the
//      com.google.mlkit.vision.DEPENDENCIES meta-data so Play pre-downloads
//      the OCR model at install instead of on first scan.
//
// Without this plugin, every EAS/prebuild build silently shipped without the
// password-save feature and the OCR pre-download. JS-side guards make both
// degrade gracefully, but this plugin makes them work as designed.
//
// SDK 58 note: prebuild now points platformProjectRoot at android/app/src/main
// (SDK 57 pointed at android/), and the MainApplication.kt template only has a
// COMMENTED add() example — both broke the original injection, which is why
// the first SDK 58 EAS build failed with "Unresolved reference
// 'credentialmanager'". Both shapes are handled below.
const { withAppBuildGradle, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'credential-manager-src');

function withCredentialManagerSources(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      // Resolve the app/src/main dir for both SDK 57 (android/) and
      // SDK 58 (android/app/src/main) platformProjectRoot shapes.
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const srcMain = platformRoot.endsWith(path.join('app', 'src', 'main'))
        ? platformRoot
        : path.join(platformRoot, 'app', 'src', 'main');
      const dest = path.join(srcMain, 'java', 'com', 'samimrrza', 'spendflow', 'credentialmanager');
      fs.mkdirSync(dest, { recursive: true });
      for (const file of fs.readdirSync(SRC_DIR)) {
        fs.copyFileSync(path.join(SRC_DIR, file), path.join(dest, file));
      }
      // Register the package in MainApplication.kt (idempotent per edit).
      const mainAppPath = path.join(
        srcMain, 'java', 'com', 'samimrrza', 'spendflow', 'MainApplication.kt',
      );
      if (fs.existsSync(mainAppPath)) {
        let kt = fs.readFileSync(mainAppPath, 'utf8');
        if (!kt.includes('com.samimrrza.spendflow.credentialmanager.CredentialManagerPackage')) {
          kt = kt.replace(
            /(import com\.facebook\.react\.ReactApplication)/,
            'import com.samimrrza.spendflow.credentialmanager.CredentialManagerPackage\n$1',
          );
        }
        if (!kt.includes('add(CredentialManagerPackage())')) {
          kt = kt.replace(
            /(PackageList\(this\)\.packages\.apply \{)/,
            '$1\n          add(CredentialManagerPackage())',
          );
        }
        fs.writeFileSync(mainAppPath, kt);
      }
      return cfg;
    },
  ]);
}

function withCredentialManagerGradle(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes('androidx.credentials:credentials')) return cfg;
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /dependencies\s*\{/,
      `dependencies {\n    implementation("androidx.credentials:credentials:1.5.0-beta01")\n    implementation("androidx.credentials:credentials-play-services-auth:1.5.0-beta01")`,
    );
    return cfg;
  });
}

function withMlKitModelManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;
    app.$ = app.$ || {};
    app['meta-data'] = app['meta-data'] || [];
    const exists = app['meta-data'].some(
      (m) => m.$ && m.$['android:name'] === 'com.google.mlkit.vision.DEPENDENCIES',
    );
    if (!exists) {
      app['meta-data'].push({
        $: {
          'android:name': 'com.google.mlkit.vision.DEPENDENCIES',
          'android:value': 'ocr',
        },
      });
    }
    return cfg;
  });
}

module.exports = function withSpendFlowNative(config) {
  config = withCredentialManagerSources(config);
  config = withCredentialManagerGradle(config);
  config = withMlKitModelManifest(config);
  return config;
};
