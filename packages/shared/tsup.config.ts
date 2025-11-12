import { defineConfig } from "tsup";

const entry = {
  index: "src/index.ts",
  routing: "src/routing.ts",
  types: "src/types.ts",
  "config/index": "src/config/index.ts",
  "config/functions-config": "src/config/functions-config.ts",
  "config/service-config": "src/config/service-config.ts",
  "config/validation-config": "src/config/validation-config.ts",
  "runtime/index": "src/runtime/index.ts",
  "runtime/base": "src/runtime/base.ts",
  "runtime/node": "src/runtime/node.ts",
  "runtime/deno": "src/runtime/deno.ts",
  "runtime/browser": "src/runtime/browser.ts",
  "validation/index": "src/validation/index.ts",
  "validation/api-response-validation": "src/validation/api-response-validation.ts",
  "validation/auth-validation": "src/validation/auth-validation.ts",
  "validation/data-validation": "src/validation/data-validation.ts",
  "validation/oauth-validation": "src/validation/oauth-validation.ts",
  "validation/rate-limit-validation": "src/validation/rate-limit-validation.ts",
  "validation/request-validation": "src/validation/request-validation.ts",
};

const sharedOptions = {
  entry,
  splitting: false,
  sourcemap: true,
  skipNodeModulesBundle: true,
  minify: false,
  treeshake: false,
  target: "es2020",
  keepNames: true,
  outExtension: ({ format }: { format: "cjs" | "esm" }) => ({
    js: format === "cjs" ? ".cjs" : ".js",
  }),
};

export default defineConfig([
  {
    ...sharedOptions,
    format: ["esm"],
    dts: true,
    clean: true,
    outDir: "dist/esm",
  },
  {
    ...sharedOptions,
    format: ["cjs"],
    dts: false,
    sourcemap: false,
    clean: false,
    outDir: "dist/node",
  },
  {
    ...sharedOptions,
    format: ["esm"],
    dts: false,
    clean: true,
    sourcemap: false,
    outDir: "../supabase/packages/shared/dist",
  },
]);
