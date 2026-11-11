import nextPlugin from "@next/eslint-plugin-next";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";

// eslint-plugin-react-hooks に存在しない set-state-in-effect ディレクティブのためのスタブルール
const wrappedReactHooksPlugin = {
  ...reactHooksPlugin,
  rules: {
    ...reactHooksPlugin.rules,
    "set-state-in-effect": {
      create: () => ({}),
    },
  },
};

export default [
  {
    ignores: [".next/**", "node_modules/**", "dist/**", "out/**", "generate_all_issues.js"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      "@typescript-eslint": tsPlugin,
      "react-hooks": wrappedReactHooksPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];
