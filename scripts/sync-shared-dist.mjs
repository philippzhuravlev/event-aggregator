import { cpSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const repoRoot = resolve(__dirname, "..");
const sharedRoot = resolve(repoRoot, "packages", "shared");
const sourceDistDir = resolve(sharedRoot, "dist");
const sourceCjsDir = resolve(sharedRoot, "dist", "cjs");
const sourceSrcDir = resolve(sharedRoot, "src");
const supabaseSharedRoot = resolve(repoRoot, "supabase", "packages", "shared");
const targetDistDir = resolve(supabaseSharedRoot, "dist");
const targetCjsDir = resolve(supabaseSharedRoot, "dist", "cjs");
const targetSrcDir = resolve(supabaseSharedRoot, "src");

if (!existsSync(sourceDistDir)) {
  console.error(
    `Shared dist directory not found at ${sourceDistDir}. Run the shared build first.`,
  );
  process.exitCode = 1;
  process.exit();
}

if (!existsSync(supabaseSharedRoot)) {
  mkdirSync(supabaseSharedRoot, { recursive: true });
}

if (existsSync(targetDistDir)) {
  rmSync(targetDistDir, { recursive: true, force: true });
}
if (existsSync(targetSrcDir)) {
  rmSync(targetSrcDir, { recursive: true, force: true });
}
if (existsSync(targetCjsDir)) {
  rmSync(targetCjsDir, { recursive: true, force: true });
}

mkdirSync(targetDistDir, { recursive: true });
mkdirSync(targetSrcDir, { recursive: true });
mkdirSync(targetCjsDir, { recursive: true });

cpSync(sourceDistDir, targetDistDir, { recursive: true });
cpSync(sourceSrcDir, targetSrcDir, { recursive: true });
if (existsSync(sourceCjsDir)) {
  cpSync(sourceCjsDir, targetCjsDir, { recursive: true });
}

console.log(`Copied shared dist to ${targetDistDir}`);
console.log(`Copied shared dist/cjs to ${targetCjsDir}`);
console.log(`Copied shared src to ${targetSrcDir}`);

