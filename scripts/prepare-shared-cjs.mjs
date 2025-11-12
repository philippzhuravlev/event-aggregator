import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const repoRoot = resolve(__dirname, "..");
const cjsDir = resolve(repoRoot, "packages", "shared", "dist", "cjs");
const packageJsonPath = resolve(cjsDir, "package.json");

if (!existsSync(cjsDir)) {
  mkdirSync(cjsDir, { recursive: true });
}

writeFileSync(
  packageJsonPath,
  JSON.stringify({ type: "commonjs" }, null, 2),
);

console.log(`Ensured CommonJS package metadata at ${packageJsonPath}`);

