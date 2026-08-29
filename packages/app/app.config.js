const path = require("node:path");
const dotenv = require("dotenv");
const baseConfig = require("./app.json").expo;

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

module.exports = () => {
  const configuredMapsApiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    "";
  const mapsApiKey = /^(your|replace|example|placeholder)/i.test(
    configuredMapsApiKey,
  )
    ? ""
    : configuredMapsApiKey;

  // Expo reads public variables while bundling App.tsx. Propagate the value
  // loaded from the monorepo root so web and native builds share one source.
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = mapsApiKey;

  return {
    ...baseConfig,
    android: {
      ...baseConfig.android,
      config: {
        ...baseConfig.android?.config,
        googleMaps: {
          ...baseConfig.android?.config?.googleMaps,
          apiKey: mapsApiKey,
        },
      },
    },
    ios: {
      ...baseConfig.ios,
      config: {
        ...baseConfig.ios?.config,
        googleMapsApiKey: mapsApiKey,
      },
    },
  };
};
