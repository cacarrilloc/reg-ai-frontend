const STORAGE_KEY = "regai_pending_org_invite_token";

/** Persist invite token across sign-up / email confirmation redirects. */
export function rememberPendingInviteToken(token: string | null | undefined): void {
  if (typeof window === "undefined") {
    return;
  }
  const cleaned = (token || "").trim();
  if (!cleaned) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, cleaned);
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function peekPendingInviteToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function clearPendingInviteToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

export function joinPathForToken(token: string): string {
  return `/join?token=${encodeURIComponent(token.trim())}`;
}

/** Sign-in URL for an organization invite. Invitees join an existing org; they do not create one. */
export function inviteSignInPath(token: string, email?: string | null): string {
  const cleaned = token.trim();
  const params = new URLSearchParams({
    next: joinPathForToken(cleaned),
    invite_token: cleaned,
  });
  const cleanedEmail = (email || "").trim();
  if (cleanedEmail) {
    params.set("email", cleanedEmail);
  }
  return `/sign-in?${params.toString()}`;
}

/** Account-creation URL for invitees who do not have a login yet. */
export function inviteSignUpPath(token: string, email?: string | null): string {
  const cleaned = token.trim();
  const params = new URLSearchParams({
    next: joinPathForToken(cleaned),
    invite_token: cleaned,
  });
  const cleanedEmail = (email || "").trim();
  if (cleanedEmail) {
    params.set("email", cleanedEmail);
  }
  return `/sign-up?${params.toString()}`;
}

/** Pull token from `/join?token=` or `/invite?token=` next paths. */
export function extractInviteTokenFromNext(nextPath: string | null | undefined): string | null {
  if (!nextPath) {
    return null;
  }
  try {
    const url = new URL(nextPath, "http://local.invalid");
    if (url.pathname !== "/join" && url.pathname !== "/invite") {
      return null;
    }
    return url.searchParams.get("token")?.trim() || null;
  } catch {
    return null;
  }
}
