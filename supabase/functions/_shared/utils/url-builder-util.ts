/**
 * Origin utilities are re-exported from the shared runtime so both Deno and
 * Node environments rely on the same configuration logic.
 */
// @deno-types="../../packages/shared/src/runtime/deno.ts"
export {
  getAllowedOrigins,
  isAllowedOrigin,
} from "../../packages/shared/dist/runtime/deno.js";
