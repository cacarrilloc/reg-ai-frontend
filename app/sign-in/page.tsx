"use client";

import type { Route } from "next";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn, ShieldCheck } from "lucide-react";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { EnterpriseSsoSignIn } from "@/components/auth/enterprise-sso-sign-in";
import { MfaChallengeForm, getMfaGateState } from "@/components/auth/mfa-challenge-form";
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons";
import { isAuthConfigured } from "@/lib/auth";
import { safeNextPath } from "@/lib/auth-redirect";
import {
  extractInviteTokenFromNext,
  joinPathForToken,
  rememberPendingInviteToken,
} from "@/lib/pending-invite";
import { fetchSsoLoginPolicy } from "@/lib/sso";
import { createClient } from "@/lib/supabase/client";
import { looksLikeEmail, resolveLoginEmail } from "@/lib/user-profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export default function SignInPage() {
  if (!isAuthConfigured()) {
    return (
      <AuthPageShell title="Sign in">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Authentication is not configured</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the frontend
            environment and redeploy.
          </p>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell title="Sign in">
      <Suspense
        fallback={
          <div className="flex min-h-[20vh] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading…
          </div>
        }
      >
        <SignInForm />
      </Suspense>
    </AuthPageShell>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const inviteToken = (
    searchParams.get("invite_token")
    || extractInviteTokenFromNext(searchParams.get("next"))
    || ""
  ).trim();
  const postAuthPath = inviteToken ? joinPathForToken(inviteToken) : nextPath;
  const prefillEmail = (searchParams.get("email") || "").trim();
  const signUpHref = `/sign-up?next=${encodeURIComponent(nextPath)}${
    inviteToken ? `&invite_token=${encodeURIComponent(inviteToken)}` : ""
  }${prefillEmail ? `&email=${encodeURIComponent(prefillEmail)}` : ""}`;

  useEffect(() => {
    if (inviteToken) {
      rememberPendingInviteToken(inviteToken);
    }
  }, [inviteToken]);

  const [identifier, setIdentifier] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const callbackError = searchParams.get("error");
    if (!callbackError) {
      return null;
    }
    const decoded = decodeURIComponent(callbackError.replace(/\+/g, " "));
    if (decoded === "auth_callback_failed") {
      return "Google/LinkedIn sign-in could not be completed. Confirm the redirect URL is allowlisted in Supabase Auth, then try again.";
    }
    if (decoded === "auth_not_configured") {
      return "Authentication is not configured.";
    }
    if (/unable to exchange external code/i.test(decoded)) {
      return "Google rejected the sign-in token exchange. In Google Cloud, use a Web application OAuth client, set redirect URI to https://ugnfslbacesddjiyjhvp.supabase.co/auth/v1/callback, then paste that client’s ID and Secret into Supabase → Authentication → Providers → Google.";
    }
    return decoded;
  });
  const [needsMfa, setNeedsMfa] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setError("Authentication is not configured.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      let email: string;
      if (looksLikeEmail(identifier)) {
        email = identifier.trim().toLowerCase();
      } else {
        try {
          email = await resolveLoginEmail(identifier);
        } catch {
          setError("Invalid login credentials");
          return;
        }
      }

      try {
        const policy = await fetchSsoLoginPolicy(email);
        if (policy.sso_required && policy.domain) {
          setError(
            `Your organization requires corporate SSO for @${policy.domain}. Use Continue with SSO below.`
          );
          return;
        }
      } catch {
        // Policy lookup failure should not block password auth entirely.
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }

      const mfaState = await getMfaGateState();
      if (mfaState === "enroll") {
        const params = new URLSearchParams({ next: postAuthPath, mode: "enroll" });
        router.push(`/mfa?${params.toString()}` as Route);
        return;
      }
      if (mfaState === "challenge") {
        setNeedsMfa(true);
        return;
      }

      router.push(postAuthPath as Route);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMfaBack() {
    const supabase = createClient();
    await supabase?.auth.signOut();
    setNeedsMfa(false);
    setPassword("");
    setError(null);
  }

  if (needsMfa) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Verify it&apos;s you
          </CardTitle>
          <CardDescription>
            Use the authenticator entry for this environment. Production and local each need their
            own setup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <MfaChallengeForm
            onVerified={() => {
              router.push(postAuthPath as Route);
              router.refresh();
            }}
            onCancel={() => void handleMfaBack()}
            onReenroll={() => {
              const params = new URLSearchParams({ next: postAuthPath, mode: "enroll" });
              router.push(`/mfa?${params.toString()}` as Route);
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Welcome Back!</CardTitle>
        <CardDescription className={inviteToken ? undefined : "text-justify"}>
          {inviteToken
            ? "Sign in with the invited email to join the organization. You do not need to create one."
            : "Sign in with Google, LinkedIn, or with your username/email and password."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Sign in with Google or LinkedIn:</p>
          <SocialAuthButtons
            nextPath={postAuthPath}
            inviteToken={inviteToken || undefined}
            disabled={isSubmitting}
          />
        </div>
        <div className="relative py-1 text-center uppercase text-muted-foreground">
          <span className="bg-card px-2 text-[0.9375rem] font-bold">or</span>
        </div>
        <EnterpriseSsoSignIn
          nextPath={postAuthPath}
          inviteToken={inviteToken || undefined}
          disabled={isSubmitting}
        />
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <p className="text-sm font-medium">Sign in with email and password:</p>
          <div className="grid gap-2">
            <Label htmlFor="sign-in-identifier">Username or email</Label>
            <Input
              id="sign-in-identifier"
              type="text"
              autoComplete="username"
              inputMode="email"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="username or you@firm.com"
              required
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="sign-in-password">Password</Label>
              <Link
                href={
                  `/forgot-password${
                    identifier.trim()
                      ? `?email=${encodeURIComponent(identifier.trim())}`
                      : ""
                  }` as Route
                }
                className="text-xs font-medium text-foreground underline underline-offset-4"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="sign-in-password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={isSubmitting} className="gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Sign in
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {inviteToken ? "Need a login first? " : "Don't have an account? "}
            <Link href={signUpHref as Route} className="font-medium text-foreground underline underline-offset-4">
              {inviteToken ? "Create an account" : "Sign up"}
            </Link>
            {inviteToken ? " — you will join this organization, not create a new one." : ""}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
