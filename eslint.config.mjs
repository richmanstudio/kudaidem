import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "generated/**", "next-env.d.ts"]),
  {
    files: ["scripts/scrape-khabarovsk.ts"],
    rules: {
      // Third-party JSON-LD and Cheerio nodes are intentionally normalized at
      // the ingestion boundary before typed catalog records are emitted.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
