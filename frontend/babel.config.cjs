// Used only by Jest (babel-jest). Vite's React plugin ignores Babel config files.
// .cjs because the package is "type": "module".
module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" } }],
    ["@babel/preset-react", { runtime: "automatic" }],
  ],
};
