const fs = require("node:fs");
const path = require("node:path");
const {
  withAppBuildGradle,
  withDangerousMod,
  withSettingsGradle,
} = require("expo/config-plugins");

const packName = "goassist_ai_model";
const modelName = "Qwen3-0.6B-Q8_0.gguf";

module.exports = function withGoAssistModelAsset(config) {
  config = withSettingsGradle(config, (mod) => {
    if (!mod.modResults.contents.includes(`include ':${packName}'`)) {
      mod.modResults.contents += `\ninclude ':${packName}'\n`;
    }
    return mod;
  });

  config = withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes(`assetPacks = [\":${packName}\"]`)) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /android\s*\{/,
        `android {\n    assetPacks = [\":${packName}\"]`,
      );
    }
    return mod;
  });

  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const androidRoot = mod.modRequest.platformProjectRoot;
      const packRoot = path.join(androidRoot, packName);
      const assetRoot = path.join(packRoot, "src", "main", "assets", packName);
      fs.mkdirSync(assetRoot, { recursive: true });
      fs.writeFileSync(
        path.join(packRoot, "build.gradle"),
        [
          "plugins {",
          "    id 'com.android.asset-pack'",
          "}",
          "",
          "assetPack {",
          `    packName = \"${packName}\"`,
          "    dynamicDelivery {",
          '        deliveryType = "install-time"',
          "    }",
          "}",
          "",
        ].join("\n"),
      );

      const preparedModel = path.join(projectRoot, ".model-cache", modelName);
      const destination = path.join(assetRoot, modelName);
      if (fs.existsSync(preparedModel)) {
        fs.copyFileSync(preparedModel, destination);
      } else if (
        process.env.CI ||
        process.env.GOASSIST_REQUIRE_AI_MODEL === "1"
      ) {
        throw new Error(
          `Missing ${modelName}. Run npm run model:prepare --workspace @buspass/app before the Android Play build.`,
        );
      }
      return mod;
    },
  ]);
};
