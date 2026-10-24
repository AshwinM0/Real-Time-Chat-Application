/** @type {import("jest").Config} */
module.exports = {
  testEnvironment: "jsdom",
  // Browser APIs jsdom lacks, before any test file imports the app.
  setupFiles: ["<rootDir>/test/polyfills.ts"],
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  moduleNameMapper: {
    "\\.(css)$": "identity-obj-proxy",
    "\\.(png|svg)$": "<rootDir>/test/fileStub.ts",
    // Every test gets a fake socket; see test/fakeSocket.ts.
    "^socket\\.io-client$": "<rootDir>/test/fakeSocket.ts",
  },
  // Reset call counts between tests (implementations are kept).
  clearMocks: true,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/main.tsx",                  // wiring
    "!src/config.ts",                 // replaced in tests, see test/setup.ts
    "!src/types.ts",                  // types only: nothing runs
    "!src/components/skeletons/**",   // markup only
  ],
  coverageThreshold: {
    "./src/hooks/": { lines: 85 },
    "./src/zustand/": { lines: 95 },
    "./src/context/": { lines: 85 },
    "./src/components/": { lines: 70 },
  },
};
