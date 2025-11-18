import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: [
        "tsconfig.json",
        "api/tsconfig.json",
        "packages/shared/tsconfig.json",
      ],
    }) as Plugin,
  ],
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text"],
      reportOnFailure: true,
      exclude: [
        "**/dist/**",
        "**/node_modules/**",
        "**/*.test.{ts,tsx,js,jsx}",
        "**/tests/**",
        "**/coverage/**",
        "**/web/**",
        "**/supabase/**",
        "**/*.config.{ts,js,mts}",
        "**/types.ts",
        "packages/**/index.ts", // Re-export files in packages
        "**/routing.ts", // Placeholder
      ],
      include: [
        "packages/shared/src/**/*.ts",
        "api/**/*.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    include: [
      "api/**/*.test.{ts,tsx,js,jsx}",
      "packages/shared/tests/**/*.test.{ts,tsx,js,jsx}",
    ],
  },
});



