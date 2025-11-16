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
    }),
  ],
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
    include: [
      "api/**/*.test.{ts,tsx,js,jsx}",
      "packages/shared/tests/**/*.test.{ts,tsx,js,jsx}",
    ],
  },
});



