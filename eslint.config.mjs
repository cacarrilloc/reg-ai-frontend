import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    // React Compiler plugin rules (eslint-plugin-react-hooks v6 / Next 16) are
    // useful for greenfield code, but currently fail many intentional data-fetch
    // and ref patterns across the app. Keep them off until those are migrated.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  {
    ignores: [
      ".next/**",
      "**/node_modules/**",
      "**/out/**",
      "**/dist/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
      // Accidental nested scaffold from `clerk init` (not part of this app)
      "clerk-nextjs/**",
      // Vendored CommonJS patches (npm audit); not app source.
      "vendor/**",
    ],
  },
];

export default eslintConfig;
