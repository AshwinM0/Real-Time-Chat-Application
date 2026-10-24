// Backend tests. Run with `npm run test:backend`: the backend is native ES modules,
// so Jest runs under node --experimental-vm-modules. Babel only strips the
// TypeScript types; it doesn't check them (`npm run typecheck` does) and leaves
// import and export alone. The frontend has its own Jest config in frontend/.
/** @type {import("jest").Config} */
export default {
  projects: [{
    displayName: "backend",
    testEnvironment: "node",
    testMatch: ["<rootDir>/backend/**/*.test.ts"],
    // "type": "module" in package.json makes .js files ES modules, but not .ts.
    extensionsToTreatAsEsm: [".ts"],
    transform: {
      "\\.ts$": ["babel-jest", {
        babelrc: false,
        configFile: false,
        // Keeps every import not marked `import type`, as tsconfig's verbatimModuleSyntax does.
        presets: [["@babel/preset-typescript", { onlyRemoveTypeImports: true }]],
      }],
    },
    globalSetup: "<rootDir>/backend/test/globalSetup.ts",       // starts MongoDB in memory once
    globalTeardown: "<rootDir>/backend/test/globalTeardown.ts", // stops it
    setupFiles: ["<rootDir>/backend/test/env.ts"],              // JWT_SECRET, NODE_ENV, CLIENT_ORIGIN
  }],
  // V8 coverage maps back to the TypeScript through Babel's source maps.
  coverageProvider: "v8",
  collectCoverageFrom: [
    "backend/**/*.ts",
    "!backend/test/**",
    "!backend/**/__tests__/**",
    "!backend/server.ts",        // wiring only
    "!backend/db/connectToDB.ts", // thin wrapper
    "!backend/types.ts",         // types only: nothing runs
  ],
  coverageThreshold: {
    "./backend/": { lines: 85, branches: 80 },
  },
};
