import { defineConfig, type ViteUserConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const config = {
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
      "packages/shared/src/**/*.test.{ts,tsx,js,jsx}",
    ],
  },
} as unknown as ViteUserConfig;

export default defineConfig(config);
