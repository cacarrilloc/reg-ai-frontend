/**
 * Restrict post-auth redirects to same-origin relative paths.
 * Blocks open redirects (`//evil.com`, `https://...`).
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!raw) {
    return fallback;
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }
  return trimmed;
}
