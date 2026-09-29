module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/__tests__/**/*.test.ts?(x)"],
  moduleNameMapper: {
    "\\.(png|jpg|jpeg)$": "<rootDir>/__mocks__/fileMock.js",
    "^@buspass/shared$": "<rootDir>/../contracts/src",
    "^lucide-react-native$": "<rootDir>/__mocks__/lucideReactNative.js",
    "^\\./src/components/JourneyMap$": "<rootDir>/__mocks__/JourneyMap.js",
  },
};
