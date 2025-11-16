import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: [
        "tsconfig.json",
        "api/tsconfig.json",
        "packages/shared/tsconfig.json",
      ],
    }) as any,
  ],
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
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
        "**/index.ts", // Re-export files
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



