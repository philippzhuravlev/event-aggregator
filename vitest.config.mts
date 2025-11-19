import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    // @ts-expect-error - vite-tsconfig-paths plugin type is incompatible with Vitest's bundled Vite types, but works at runtime
    tsconfigPaths({
      projects: [
        "tsconfig.json",
        "api/tsconfig.json",
        "packages/shared/tsconfig.json",
      ],
    }),
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
      // Only track files in packages/shared/src and api, exclude everything else
      all: false,
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
