import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // bridge/ is a standalone Node service, not part of the Next app: no
    // React, no JSX, its own package.json. Next's React rules mis-fire on it
    // (Baileys' useMultiFileAuthState() gets flagged as a React hook because
    // of the "use" prefix). It is syntax-checked by `npm test` instead.
    "bridge/**",
  ]),
]);

export default eslintConfig;
