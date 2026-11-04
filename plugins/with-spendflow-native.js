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
const { withAppBuildGradle, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'credential-manager-src');
const REL_PKG_DIR = path.join('app', 'src', 'main', 'java', 'com', 'samimrrza', 'spendflow', 'credentialmanager');

function withCredentialManagerSources(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const platformRoot = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main');
      const dest = path.join(platformRoot, REL_PKG_DIR);
      fs.mkdirSync(dest, { recursive: true });
      for (const file of fs.readdirSync(SRC_DIR)) {
        fs.copyFileSync(path.join(SRC_DIR, file), path.join(dest, file));
      }
      // Register the package in MainApplication.kt (idempotent).
      const mainAppPath = path.join(
        platformRoot, 'java', 'com', 'samimrrza', 'spendflow', 'MainApplication.kt',
      );
      if (fs.existsSync(mainAppPath)) {
        let kt = fs.readFileSync(mainAppPath, 'utf8');
        if (!kt.includes('CredentialManagerPackage')) {
          kt = kt.replace(
            /(import com\.facebook\.react\.ReactApplication)/,
            'import com.samimrrza.spendflow.credentialmanager.CredentialManagerPackage\n$1',
          );
          // Insert ahead of the first package registration so autolinked
          // packages and ours coexist.
          kt = kt.replace(
            /(\n\s+add\()(?=[A-Z])/,
            '$1CredentialManagerPackage())\n$1',
          );
          fs.writeFileSync(mainAppPath, kt);
        }
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
