import { apiFetch } from "@/lib/api";

export const USERNAME_AVAILABLE_PATH = (username: string) =>
  `/api/v1/auth/usernames/${encodeURIComponent(username)}/available`;

export const LOGIN_IDENTIFIER_PATH = "/api/v1/auth/login-identifier";

export const USER_PROFILE_PATH = "/api/v1/auth/me/profile";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$/;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function isValidUsernameFormat(username: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(username));
}

export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.includes("@") && !trimmed.startsWith("@") && !trimmed.endsWith("@");
}

/** Resolve a username or email to the Auth email used by signInWithPassword. */
export async function resolveLoginEmail(identifier: string): Promise<string> {
  const response = await apiFetch<{ email: string }>(LOGIN_IDENTIFIER_PATH, {
    method: "POST",
    body: JSON.stringify({ identifier: identifier.trim() })
  });
  return response.email.trim().toLowerCase();
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const normalized = normalizeUsername(username);
  if (!isValidUsernameFormat(normalized)) {
    return false;
  }
  const response = await apiFetch<{ username: string; available: boolean }>(
    USERNAME_AVAILABLE_PATH(normalized),
    undefined,
    { timeoutMs: 8_000 }
  );
  return Boolean(response.available);
}

/** Throws a clear username-taken error when the name is reserved. */
export async function assertUsernameAvailable(username: string): Promise<void> {
  const available = await checkUsernameAvailable(username);
  if (!available) {
    throw new Error("That username is already taken. Choose another.");
  }
}

export async function claimUserProfile(
  payload: { username: string; email: string },
  token: string
): Promise<{ username: string; email: string }> {
  return apiFetch<{ username: string; email: string }>(
    USER_PROFILE_PATH,
    {
      method: "POST",
      body: JSON.stringify({
        username: normalizeUsername(payload.username),
        email: payload.email.trim().toLowerCase()
      })
    },
    { token }
  );
}
