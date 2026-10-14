"use client";

import type { Route } from "next";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { useAuthSession } from "@/components/auth/auth-session";
import { apiFetch } from "@/lib/api";
import {
  ORGANIZATIONS_SWITCH_PATH,
  switchOrganizationBody,
} from "@/lib/organizations";
import {
  clearPendingInviteToken,
  inviteSignInPath,
  joinPathForToken,
  peekPendingInviteToken,
  rememberPendingInviteToken,
} from "@/lib/pending-invite";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function readInviteCookieToken(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith("regai_pending_invite_token="));
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match.split("=").slice(1).join("=")).trim() || null;
  } catch {
    return null;
  }
}

type AcceptInviteResponse = {
  auth_org_id: string;
  role: string;
  joined: boolean;
};

type InvitePreview = {
  email: string;
  role: string;
  organization_name: string | null;
  status: string;
  expired: boolean;
};

function parseInviteMismatch(error: string | null): {
  inviteEmail: string | null;
  signedInAs: string | null;
} {
  if (!error) {
    return { inviteEmail: null, signedInAs: null };
  }
  const inviteMatch = error.match(/sent to\s+([^\s]+)/i);
  const signedInMatch = error.match(/signed in as\s+([^\s]+)/i);
  const clean = (value: string | undefined) =>
    (value || "").replace(/[.,;:]+$/, "").trim().toLowerCase() || null;
  return {
    inviteEmail: clean(inviteMatch?.[1]),
    signedInAs: clean(signedInMatch?.[1]),
  };
}

export default function InvitePage() {
  return (
    <AuthPageShell title="Accept invitation" className="max-w-md">
      <Suspense
        fallback={
          <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading invitation…
          </div>
        }
      >
        <InviteAcceptForm />
      </Suspense>
    </AuthPageShell>
  );
}

function InviteAcceptForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlToken = (searchParams.get("token") || "").trim();
  const [token, setToken] = useState(urlToken);
  const [tokenReady, setTokenReady] = useState(Boolean(urlToken));
  const { isLoaded, isSignedIn, accessToken, refreshSession, signOut } = useAuthSession();

  const [phase, setPhase] = useState<
    "loading" | "redirecting" | "accepting" | "switching" | "done" | "error"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const inFlightRef = useRef(false);
  const signInRedirectStarted = useRef(false);

  // Recover token if email-confirm redirect dropped ?token= from the URL.
  useEffect(() => {
    if (urlToken) {
      rememberPendingInviteToken(urlToken);
      setToken(urlToken);
      setTokenReady(true);
      return;
    }
    const recovered = peekPendingInviteToken() || readInviteCookieToken();
    if (recovered) {
      setToken(recovered);
      rememberPendingInviteToken(recovered);
      setTokenReady(true);
      router.replace(joinPathForToken(recovered) as Route);
      return;
    }
    setTokenReady(true);
  }, [router, urlToken]);

  const mismatch = parseInviteMismatch(error);
  const effectiveInviteEmail = inviteEmail || mismatch.inviteEmail;

  // Load invite email early so mismatch UI can offer the correct continue path.
  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    async function loadPreview() {
      try {
        const preview = await apiFetch<InvitePreview>(
          `/api/v1/organizations/team-requests/preview?token=${encodeURIComponent(token)}`,
          undefined,
          { timeoutMs: 12_000 }
        );
        if (!cancelled) {
          setInviteEmail(preview.email);
        }
      } catch {
        // Preview is best-effort; accept/sign-in flow can continue without it.
      }
    }
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Organization invites join an existing workspace — send unsigned users to sign-in.
  useEffect(() => {
    if (!isLoaded || !token || isSignedIn || signInRedirectStarted.current) {
      return;
    }

    let cancelled = false;
    signInRedirectStarted.current = true;

    async function routeToSignIn() {
      setPhase("redirecting");
      let email = inviteEmail || "";
      try {
        if (!email) {
          const preview = await apiFetch<InvitePreview>(
            `/api/v1/organizations/team-requests/preview?token=${encodeURIComponent(token)}`,
            undefined,
            { timeoutMs: 12_000 }
          );
          if (preview.expired || preview.status !== "pending") {
            if (!cancelled) {
              setPhase("error");
              setError(
                preview.expired
                  ? "This invitation has expired. Ask your teammate to send a new one."
                  : "This invitation is no longer pending."
              );
            }
            return;
          }
          email = preview.email;
          setInviteEmail(preview.email);
        }
      } catch {
        // Continue to sign-in without prefilling if preview is temporarily unavailable.
      }
      if (cancelled) {
        return;
      }
      rememberPendingInviteToken(token);
      router.replace(inviteSignInPath(token, email) as Route);
    }

    void routeToSignIn();
    return () => {
      cancelled = true;
    };
  }, [inviteEmail, isLoaded, isSignedIn, router, token]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !accessToken || !token || inFlightRef.current) {
      return;
    }

    let cancelled = false;
    inFlightRef.current = true;

    async function acceptInvite() {
      setPhase("accepting");
      setError(null);
      try {
        const accepted = await apiFetch<AcceptInviteResponse>(
          "/api/v1/organizations/team-requests/accept",
          { method: "POST", body: JSON.stringify({ token }) },
          { token: accessToken, timeoutMs: 20_000 }
        );

        if (!cancelled) {
          setPhase("switching");
        }

        await apiFetch(
          ORGANIZATIONS_SWITCH_PATH,
          { method: "POST", body: switchOrganizationBody(accepted.auth_org_id) },
          { token: accessToken, timeoutMs: 15_000 }
        );

        try {
          await Promise.race([
            refreshSession(),
            new Promise((resolve) => window.setTimeout(resolve, 4_000)),
          ]);
        } catch {
          // Active org was already updated via the switch endpoint.
        }

        clearPendingInviteToken();
        if (typeof document !== "undefined") {
          document.cookie = "regai_pending_invite_token=; Path=/; Max-Age=0; SameSite=Lax";
        }
        setPhase("done");
        // Guided MFA setup before the app shell — avoid dumping invitees onto
        // /dashboard where the gate only shows a bare authenticator-code prompt.
        const mfaParams = new URLSearchParams({
          next: "/dashboard",
          mode: "enroll",
          from: "invite",
        });
        router.replace(`/mfa?${mfaParams.toString()}` as Route);
        router.refresh();
      } catch (caught) {
        if (cancelled) {
          inFlightRef.current = false;
          return;
        }
        setPhase("error");
        setError(caught instanceof Error ? caught.message : "Unable to accept this invitation.");
        inFlightRef.current = false;
      }
    }

    void acceptInvite();
    return () => {
      cancelled = true;
      inFlightRef.current = false;
    };
  }, [accessToken, isLoaded, isSignedIn, refreshSession, router, token]);

  async function continueAsInviteEmail() {
    if (!effectiveInviteEmail) {
      return;
    }
    setIsSwitchingAccount(true);
    try {
      await signOut();
    } catch {
      // Still route to the invited sign-in flow.
    }
    rememberPendingInviteToken(token);
    router.replace(inviteSignInPath(token, effectiveInviteEmail) as Route);
  }

  function retryAccept() {
    inFlightRef.current = false;
    signInRedirectStarted.current = false;
    setError(null);
    setPhase("loading");
  }

  if (!tokenReady) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Joining organization…</CardTitle>
          <CardDescription>Restoring your invitation…</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Please wait…
        </CardContent>
      </Card>
    );
  }

  if (!token) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Invalid invitation link</CardTitle>
          <CardDescription>
            This link is missing an invite token. Ask your teammate to send a new invitation.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (phase === "error") {
    const isAccountMismatch = Boolean(mismatch.inviteEmail || mismatch.signedInAs);
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {isAccountMismatch ? "Wrong account signed in" : "Could not accept invitation"}
          </CardTitle>
          <CardDescription>
            {isAccountMismatch && effectiveInviteEmail
              ? `This invitation is for ${effectiveInviteEmail}. You are currently signed in as ${
                  mismatch.signedInAs || "a different account"
                }. Sign out and continue with the invited email.`
              : error || "Something went wrong while joining the organization."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {isAccountMismatch && effectiveInviteEmail ? (
            <Button
              type="button"
              disabled={isSwitchingAccount}
              onClick={() => void continueAsInviteEmail()}
            >
              {isSwitchingAccount ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Continue as {effectiveInviteEmail}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={retryAccept}>
              Try again
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => router.replace("/organizations" as Route)}>
            Go to organizations
          </Button>
        </CardContent>
      </Card>
    );
  }

  const statusCopy =
    phase === "redirecting"
      ? "Sign in with the invited email to join this organization. You do not need to create one."
      : phase === "switching"
        ? "Opening your organization…"
        : phase === "done"
          ? "Invite accepted. Next you’ll set up an authenticator app for sign-in."
          : "Accepting your invitation and opening the organization.";

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>
          {phase === "redirecting" ? "Sign in to join…" : "Joining organization…"}
        </CardTitle>
        <CardDescription>{statusCopy}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Please wait…
      </CardContent>
    </Card>
  );
}
