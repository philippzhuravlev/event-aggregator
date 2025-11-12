export function sanitizeSearchQuery(
  input: string,
  maxLength: number,
): string {
  return input
    .replace(/[^a-zA-Z0-9\s\-'",.&]/g, "")
    .trim()
    .substring(0, maxLength);
}

