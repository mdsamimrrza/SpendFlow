// Config plugin: pins SpendFlow's Android build hardening across `expo prebuild`.
//
// The Expo 57 template's defaults leave the release APK with all 4 ABIs and no
// R8 shrinking (~149 MB). This plugin maintains, in generated files:
//   1. gradle.properties:
//        - reactNativeArchitectures   → ABI list (arm64-v8a only; minSdk 24 /
//          Android 7 means pre-arm64 devices can't install the app anyway).
//          Per-build override: ./gradlew <task> -PreactNativeArchitectures=arm64-v8a,x86_64
//          (the x86_64 extra being for the Windows emulator).
//        - android.enableMinifyInReleaseBuilds / android.enableShrinkResources
//          InReleaseBuilds → R8 + resource shrinking (50 MB of unminified dex).
//   2. app/build.gradle: the ndk.abiFilters block consuming that property
//      (the template omits it entirely, so every AAR — incl. ML Kit's
//      ~10.5 MB/ABI OCR engine — would ship for all 4 ABIs otherwise).
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const ABIS = 'arm64-v8a';

// Property list maintained in gradle.properties: [key, value]. An entry already
// present in the template is updated in place; missing ones are appended.
const PROPERTIES = [
  ['reactNativeArchitectures', ABIS],
  ['android.enableMinifyInReleaseBuilds', 'true'],
  ['android.enableShrinkResourcesInReleaseBuilds', 'true'],
];

const withAndroidBuildConfig = (config) => {
  // 1. gradle.properties — the values themselves.
  config = withGradleProperties(config, (cfg) => {
    for (const [key, value] of PROPERTIES) {
      const i = cfg.modResults.findIndex(
        (item) => item.type === 'property' && item.key === key,
      );
      if (i >= 0) cfg.modResults[i].value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });

  // 2. app/build.gradle — consume the ABI list (idempotent: skip if present).
  config = withAppBuildGradle(config, (cfg) => {
    if (/abiFilters/.test(cfg.modResults.contents)) return cfg;
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /(\n(\s*)versionName\s+"[^"]*")/,
      (match) =>
        `${match}\n\n` +
        `${' '.repeat(8)}// Without abiFilters every AAR ships all 4 ABIs (~119 MB of the APK);\n` +
        `${' '.repeat(8)}// the list comes from reactNativeArchitectures in gradle.properties —\n` +
        `${' '.repeat(8)}// maintained by plugins/with-android-build-config.js.\n` +
        `${' '.repeat(8)}ndk {\n` +
        `${' '.repeat(12)}abiFilters.addAll(\n` +
        `${' '.repeat(16)}(findProperty('reactNativeArchitectures') ?: 'armeabi-v7a,arm64-v8a,x86,x86_64')\n` +
        `${' '.repeat(20)}.split(',').collect { it.trim() }\n` +
        `${' '.repeat(12)})\n` +
        `${' '.repeat(8)}}`,
    );
    return cfg;
  });

  return config;
};

module.exports = withAndroidBuildConfig;
