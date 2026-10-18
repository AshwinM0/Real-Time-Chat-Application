// Backend tests. Run with `npm run test:backend`: the backend is native ES modules,
// so Jest runs under node --experimental-vm-modules with no Babel transform.
// The frontend has its own Jest config in frontend/.
export default {
  projects: [{
    displayName: "backend",
    testEnvironment: "node",
    testMatch: ["<rootDir>/backend/**/*.test.js"],
    transform: {},                                              // native ESM, no Babel
    globalSetup: "<rootDir>/backend/test/globalSetup.js",       // starts MongoDB in memory once
    globalTeardown: "<rootDir>/backend/test/globalTeardown.js", // stops it
    setupFiles: ["<rootDir>/backend/test/env.js"],              // JWT_SECRET, NODE_ENV, CLIENT_ORIGIN
  }],
  // Babel coverage needs a transform; V8 coverage works on untransformed ESM.
  coverageProvider: "v8",
  collectCoverageFrom: [
    "backend/**/*.js",
    "!backend/test/**",
    "!backend/**/__tests__/**",
    "!backend/server.js",        // wiring only
    "!backend/db/connectToDB.js", // thin wrapper
  ],
  coverageThreshold: {
    "./backend/": { lines: 85, branches: 80 },
  },
};
