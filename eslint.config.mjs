import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Ignore Prisma-generated files — they contain require() calls, any types,
  // and unused vars that are intentional and outside our control.
  { ignores: ["src/generated/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Suppress unused-vars noise for intentionally-ignored variables:
  //   • Variables prefixed with _ (e.g. _id, _ctx) — destructured to exclude
  //     them from a rest spread but not read directly.
  //   • Catch-clause bindings (err, e) that are swallowed intentionally.
  {
    rules: {
      "no-unused-vars": ["warn", {
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_?err|^_?e$",
        destructuredArrayIgnorePattern: "^_",
      }],
      "@typescript-eslint/no-unused-vars": ["warn", {
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_?err|^_?e$",
        destructuredArrayIgnorePattern: "^_",
      }],
    },
  },
];

export default eslintConfig;
