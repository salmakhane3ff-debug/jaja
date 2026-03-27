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
  // Downgrade unused-vars rules to warnings so pre-existing lib patterns
  // (destructured _id, unused catch bindings, etc.) don't block the build.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "no-unused-vars": "warn",
    },
  },
];

export default eslintConfig;
