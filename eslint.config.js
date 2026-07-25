import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "contracts/out/**",
      "contracts/cache/**",
    ],
  },
  js.configs.recommended,
  ...nextVitals,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  }
);
