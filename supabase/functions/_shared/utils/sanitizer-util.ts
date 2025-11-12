import { sanitizeSearchQuery as sharedSanitizeSearchQuery } from "../../packages/shared/dist/utils/sanitizer-util.js";

export function sanitizeSearchQuery(
  input: string,
  maxLength: number,
): string {
  return sharedSanitizeSearchQuery(input, maxLength);
}

