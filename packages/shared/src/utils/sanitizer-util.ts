const allowedPunctuation = new Set(["-", "'", '"', ",", ".", "&"]);
const alphanumericOrWhitespace = /[a-zA-Z0-9\s]/;

export function sanitizeSearchQuery(
  input: string,
  maxLength: number,
): string {
  const filtered = Array.from(input).filter(
    (char) =>
      allowedPunctuation.has(char) || alphanumericOrWhitespace.test(char),
  );

  return filtered
    .join("")
    .trim()
    .substring(0, maxLength);
}
