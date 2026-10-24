// Used only by Jest (babel-jest). Vite's React plugin ignores Babel config files.
// .cjs because the package is "type": "module". preset-typescript only strips the
// types; `npm run typecheck` is what checks them.
module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" } }],
    ["@babel/preset-react", { runtime: "automatic" }],
    // Keeps every import not marked `import type`, as tsconfig's verbatimModuleSyntax does.
    ["@babel/preset-typescript", { onlyRemoveTypeImports: true }],
  ],
};
