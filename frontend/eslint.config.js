// Lints the app and its tests: `npm run lint`. It's here, rather than in an
// .eslintrc, because ESLint uses the nearest eslint.config.js it finds going up
// from where it runs, and the root has one for the backend.
//
// The app's code may not use `any` or `unknown`, write casts or non-null `!`
// assertions, or pass along an `any` that came from a library (the no-unsafe-*
// rules, which need the type checker: hence projectService). Where one is truly
// needed, such as reading a caught error, disable the rule on that line with
// `-- <why>`. Tests and their helpers are exempt from those.
//
// Every object type has a name, tests included: it's declared with `interface` or
// `type` and used by that name, never written out in a signature, props, a generic
// argument, a union or inside another type.
import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const namedTypes = {
  selector: "TSTypeLiteral:not(TSTypeAliasDeclaration > TSTypeLiteral)",
  message: "Name this type: declare it with `interface` or `type`, and use the name here.",
};
const noUnknown = {
  selector: "TSUnknownKeyword",
  message: "Give it a real type. If it can truly be anything, such as a caught error, disable this rule on that line and say why.",
};

const typeRules = {
  "@typescript-eslint/no-explicit-any": "error",
  "no-restricted-syntax": ["error", noUnknown, namedTypes],
  "@typescript-eslint/no-unsafe-argument": "error",
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-return": "error",
  "@typescript-eslint/no-unsafe-type-assertion": "error",
  "@typescript-eslint/no-non-null-assertion": "error",
};

export default tseslint.config(
  // Only TypeScript is linted. The .js and .cjs files are tool configs.
  { ignores: ["dist/", "dist-e2e/", "coverage/", "**/*.js", "**/*.cjs"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { react, "react-hooks": reactHooks, "react-refresh": reactRefresh },
    settings: { react: { version: "18.2" } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react/jsx-no-target-blank": "off",
      // TypeScript checks props.
      "react/prop-types": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // As in tsconfig: a leading underscore marks something unused on purpose.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      ...typeRules,
    },
  },
  {
    // A context's file exports its provider and the hook that reads it. Editing
    // one reloads the page instead of hot-swapping, which is fine for these.
    files: ["src/context/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    files: ["**/__tests__/**", "test/**"],
    rules: {
      ...Object.fromEntries(Object.keys(typeRules).map((rule) => [rule, "off"])),
      // unknown is allowed here, but types still have names.
      "no-restricted-syntax": ["error", namedTypes],
      "react-refresh/only-export-components": "off",
    },
  },
);
