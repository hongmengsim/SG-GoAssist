import { requireOptionalNativeModule } from "expo-modules-core";

export type GoAssistModelAssetModule = {
  getModelPath(): Promise<{
    path: string;
    checksumVerified: boolean;
    version: string;
  }>;
};

export const goAssistModelAsset =
  requireOptionalNativeModule<GoAssistModelAssetModule>("GoAssistModelAsset");
