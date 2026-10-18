module.exports = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/test/setup.js"],
  moduleNameMapper: {
    "\\.(css)$": "identity-obj-proxy",
    "\\.(png|svg)$": "<rootDir>/test/fileStub.js",
    // Every test gets a fake socket; see test/fakeSocket.js.
    "^socket\\.io-client$": "<rootDir>/test/fakeSocket.js",
  },
  // Reset call counts between tests (implementations are kept).
  clearMocks: true,
  collectCoverageFrom: [
    "src/**/*.{js,jsx}",
    "!src/main.jsx",                  // wiring
    "!src/config.js",                 // replaced in tests, see test/setup.js
    "!src/components/skeletons/**",   // markup only
  ],
  coverageThreshold: {
    "./src/hooks/": { lines: 85 },
    "./src/zustand/": { lines: 95 },
    "./src/context/": { lines: 85 },
    "./src/components/": { lines: 70 },
  },
};
