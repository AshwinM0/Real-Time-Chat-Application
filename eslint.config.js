// Lints the backend and the end-to-end tests: `npm run lint`. The frontend has its
// own config, in frontend/.
//
// The backend's code may not use `any` or `unknown`, write casts or non-null `!`
// assertions, or pass along an `any` that came from a library (the no-unsafe-*
// rules, which need the type checker: hence projectService). Where one is truly
// needed, such as reading a caught error, disable the rule on that line with
// `-- <why>`. Tests and their helpers are exempt from those.
//
// Every object type has a name, tests included: it's declared with `interface` or
// `type` and used by that name, never written out in a signature, a generic
// argument, a union or inside another type.
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
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

export default defineConfig(
  { ignores: ["frontend/", "dist/", "coverage/", "playwright-report/", "test-results/", "docs/"] },
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // As in tsconfig: a leading underscore marks something unused on purpose.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      ...typeRules,
    },
  },
  {
    files: ["backend/__tests__/**", "backend/test/**", "e2e/**", "playwright.config.ts"],
    rules: {
      ...Object.fromEntries(Object.keys(typeRules).map((rule) => [rule, "off"])),
      // unknown is allowed here, but types still have names.
      "no-restricted-syntax": ["error", namedTypes],
    },
  },
);
