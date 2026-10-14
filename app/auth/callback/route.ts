import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getApiBaseUrl } from "@/lib/api";
import { safeNextPath } from "@/lib/auth-redirect";
import { joinPathForToken } from "@/lib/pending-invite";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Handles Supabase Auth OAuth / SSO / email confirmation / password-recovery
 * redirects (PKCE code).
 *
 * Session cookies must be written onto the redirect `NextResponse` — setting
 * them only via `cookies()` from `next/headers` is often dropped on redirect.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const oauthError = requestUrl.searchParams.get("error_description")
    || requestUrl.searchParams.get("error");
  const inviteToken = (requestUrl.searchParams.get("invite_token") || "").trim();
  const recoveryHint =
    requestUrl.searchParams.get("type") === "recovery"
    || requestUrl.searchParams.get("next") === "/update-password";
  // Prefer explicit invite_token so nested ?token= inside `next` is not lost by
  // Supabase email confirmation redirect parsing.
  const safeNext = inviteToken
    ? joinPathForToken(inviteToken)
    : recoveryHint
      ? "/update-password"
      : safeNextPath(requestUrl.searchParams.get("next"));
  const afterPasswordUpdate = safeNextPath(
    requestUrl.searchParams.get("after"),
    "/dashboard"
  );
  const pendingUsername = (requestUrl.searchParams.get("username") || "").trim().toLowerCase();

  if (oauthError) {
    return redirectToSignIn(requestUrl.origin, safeNext, oauthError);
  }

  if (code) {
    const supabaseUrl = getSupabaseUrl();
    const anonKey = getSupabaseAnonKey();
    if (!supabaseUrl || !anonKey) {
      return redirectToSignIn(requestUrl.origin, safeNext, "auth_not_configured");
    }

    const cookieStore = await cookies();
    const redirectTarget =
      recoveryHint || safeNext === "/update-password"
        ? (() => {
            const url = new URL("/update-password", requestUrl.origin);
            if (afterPasswordUpdate && afterPasswordUpdate !== "/dashboard") {
              url.searchParams.set("after", afterPasswordUpdate);
            }
            return url;
          })()
        : new URL(safeNext, requestUrl.origin);
    const successRedirect = NextResponse.redirect(redirectTarget);
    if (inviteToken) {
      successRedirect.cookies.set("regai_pending_invite_token", inviteToken, {
        path: "/",
        maxAge: 60 * 60,
        sameSite: "lax",
      });
    }

    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
            successRedirect.cookies.set(name, value, options);
          }
        },
      },
    });

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const token = data.session?.access_token;
      const email = (data.session?.user?.email || "").trim().toLowerCase();
      // Skip invite/profile side-effects during password recovery.
      if (token && !recoveryHint && safeNext !== "/update-password") {
        if (pendingUsername) {
          try {
            const claimResponse = await fetch(`${getApiBaseUrl()}/api/v1/auth/me/profile`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                username: pendingUsername,
                email: email || undefined,
              }),
              cache: "no-store",
              signal: AbortSignal.timeout(4000),
            });
            if (!claimResponse.ok) {
              let detail = "";
              try {
                const payload = (await claimResponse.json()) as { detail?: unknown };
                detail = typeof payload.detail === "string" ? payload.detail : "";
              } catch {
                detail = "";
              }
              if (/already taken/i.test(detail)) {
                const retry = new URL("/sign-up", requestUrl.origin);
                retry.searchParams.set("error", "username_taken");
                retry.searchParams.set("username", pendingUsername);
                if (inviteToken) {
                  retry.searchParams.set("invite_token", inviteToken);
                }
                if (safeNext && safeNext !== "/dashboard") {
                  retry.searchParams.set("next", safeNext);
                }
                const retryRedirect = NextResponse.redirect(retry);
                // Preserve session cookies from the exchange so the user stays signed in.
                for (const cookie of successRedirect.cookies.getAll()) {
                  retryRedirect.cookies.set(cookie.name, cookie.value);
                }
                return retryRedirect;
              }
            }
          } catch {
            // Username claim is best-effort for non-conflict failures.
          }
        }
        if (inviteToken) {
          try {
            await fetch(`${getApiBaseUrl()}/api/v1/organizations/team-requests/accept`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ token: inviteToken }),
              cache: "no-store",
              signal: AbortSignal.timeout(12_000),
            });
          } catch {
            // Join page will retry accept if this best-effort call fails.
          }
        }
        try {
          await fetch(`${getApiBaseUrl()}/api/v1/auth/sso/jit-sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ groups: null }),
            cache: "no-store",
            signal: AbortSignal.timeout(4000),
          });
        } catch {
          // JIT is best-effort; OrganizationGate still handles missing membership.
        }
      }
      return successRedirect;
    }

    return redirectToSignIn(
      requestUrl.origin,
      safeNext,
      error.message || "auth_callback_failed"
    );
  }

  return redirectToSignIn(requestUrl.origin, safeNext, "auth_callback_failed");
}

function redirectToSignIn(origin: string, next: string, error: string) {
  const failure = new URL("/sign-in", origin);
  failure.searchParams.set("error", error);
  failure.searchParams.set("next", next);
  return NextResponse.redirect(failure);
}
