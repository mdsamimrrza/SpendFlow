export default ({ config }) => {
  // If EAS provides the Google Services JSON as a file environment variable,
  // we override the local path with the temporary file path injected by EAS.
  if (process.env.GOOGLE_SERVICES_JSON) {
    config.android = config.android || {};
    config.android.googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  }

  return config;
};
