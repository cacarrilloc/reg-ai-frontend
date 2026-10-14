"use client";

import type { Route } from "next";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { EnterpriseSsoSignIn } from "@/components/auth/enterprise-sso-sign-in";
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
import { useIsClient } from "@/lib/use-is-client";
import { cn, successTextClassName } from "@/lib/utils";
import {
  assertUsernameAvailable,
  checkUsernameAvailable,
  claimUserProfile,
  isValidUsernameFormat,
  normalizeUsername
} from "@/lib/user-profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export default function SignUpPage() {
  if (!isAuthConfigured()) {
    return (

<AuthPageShell title="Sign up">
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
    <AuthPageShell title="Sign up">
      <Suspense
        fallback={
          <div className="flex min-h-[20vh] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading…
          </div>
        }
      >
        <SignUpForm />
      </Suspense>
    </AuthPageShell>
  );
}

function SignUpForm() {
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const inviteToken = (
    searchParams.get("invite_token")
    || extractInviteTokenFromNext(searchParams.get("next"))
    || ""
  ).trim();
  const prefillEmail = (searchParams.get("email") || "").trim();
  const signInHref = `/sign-in?next=${encodeURIComponent(nextPath)}${
    inviteToken ? `&invite_token=${encodeURIComponent(inviteToken)}` : ""
  }${prefillEmail ? `&email=${encodeURIComponent(prefillEmail)}` : ""}`;

  const [username, setUsername] = useState(() => {
    const fromQuery = (searchParams.get("username") || "").trim().toLowerCase();
    if (fromQuery) {
      return fromQuery;
    }
    if (inviteToken && prefillEmail.includes("@")) {
      return prefillEmail.split("@")[0]?.trim().toLowerCase() || "";
    }
    return "";
  });
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [isDone, setIsDone] = useState(false);

  const isClient = useIsClient();
  const normalizedUsername = useMemo(() => normalizeUsername(username), [username]);
  const usernameReady = isValidUsernameFormat(normalizedUsername);
  // Keep disabled deterministic across SSR/hydration (boolean attrs serialize as null vs true).
  const actionsDisabled =
    !isClient || isSubmitting || !usernameReady || usernameStatus === "taken" || usernameStatus === "checking";
  const postAuthPath = inviteToken ? joinPathForToken(inviteToken) : nextPath;

  useEffect(() => {
    if (inviteToken) {
      rememberPendingInviteToken(inviteToken);
    }
  }, [inviteToken]);

  useEffect(() => {
    const paramsError = (searchParams.get("error") || "").trim();
    if (paramsError === "username_taken") {
      setError("That username is already taken. Choose another and try again.");
      setUsernameStatus("taken");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!normalizedUsername) {
      setUsernameStatus("idle");
      return;
    }
    if (!usernameReady) {
      setUsernameStatus("invalid");
      return;
    }

    let cancelled = false;
    setUsernameStatus("checking");
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const available = await checkUsernameAvailable(normalizedUsername);
          if (cancelled) return;
          setUsernameStatus(available ? "available" : "taken");
          if (!available) {
            setError("That username is already taken. Choose another.");
          } else {
            setError((current) =>
              current === "That username is already taken. Choose another."
              || current === "That username is already taken. Choose another and try again."
                ? null
                : current
            );
          }
        } catch {
          if (!cancelled) {
            // Don't block signup if the availability probe fails; submit will retry.
            setUsernameStatus("idle");
          }
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [normalizedUsername, usernameReady]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setError("Authentication is not configured.");
      return;
    }

    if (!usernameReady) {
      setError(
        "Username must be 3–32 characters, start/end with a letter or number, and use only lowercase letters, numbers, underscores, or hyphens."
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      try {
        const policy = await fetchSsoLoginPolicy(email.trim());
        if (policy.sso_required && policy.domain) {
          setError(
            `Your organization requires corporate SSO for @${policy.domain}. Use Continue with SSO on the sign-in page.`
          );
          return;
        }
      } catch {
        // Ignore policy lookup failures for sign-up path.
      }

      try {
        await assertUsernameAvailable(normalizedUsername);
        setUsernameStatus("available");
      } catch (availabilityError) {
        setUsernameStatus("taken");
        setError(
          availabilityError instanceof Error
            ? availabilityError.message
            : "That username is already taken. Choose another."
        );
        return;
      }

      // Keep invite_token as its own query param — nesting `/join?token=` inside
      // `next` is often truncated by Supabase email confirmation redirects.
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", inviteToken ? "/join" : nextPath);
      callbackUrl.searchParams.set("username", normalizedUsername);
      if (inviteToken) {
        rememberPendingInviteToken(inviteToken);
        callbackUrl.searchParams.set("invite_token", inviteToken);
      }
      const emailRedirectTo = callbackUrl.toString();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo,
          data: {
            username: normalizedUsername
          }
        }
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      const identities = data.user?.identities ?? [];
      if (data.user && identities.length === 0) {
        setError(
          "An account with this email already exists. Sign in, or use password reset if you never received a confirmation email."
        );
        return;
      }

      if (data.session?.access_token) {
        try {
          await claimUserProfile(
            { username: normalizedUsername, email: email.trim() },
            data.session.access_token
          );
        } catch (claimError) {
          const message =
            claimError instanceof Error
              ? claimError.message
              : "Account created, but username could not be reserved. Try signing in.";
          if (/already taken/i.test(message)) {
            setUsernameStatus("taken");
          }
          setError(message);
          return;
        }
        window.location.assign(postAuthPath);
        return;
      }

      setIsDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign up.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isDone) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a confirmation link to {email}.
            {inviteToken
              ? " After confirming, you will finish joining the organization."
              : " After confirming, you will continue to your next step."}{" "}
            Check spam if it does not arrive within a minute.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link href={signInHref as Route} className="text-sm font-medium underline underline-offset-4">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-center">
          {inviteToken ? "Join your team" : "Create Organization"}
        </CardTitle>
        <CardDescription className={inviteToken ? undefined : "text-justify"}>
          {inviteToken
            ? "If you already have a Reg-AI login, go back to sign in. Otherwise create an account with the invited email — you will join the existing organization and will not create a new one."
            : "Create your master username, then use Gmail, LinkedIn or another email with password to create an organization."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <p className="text-sm font-medium">
            {inviteToken ? (
              <>
                Username: <span className="text-destructive">*</span>
              </>
            ) : (
              <>
                1. Create your master username: <span className="text-destructive">*</span>
              </>
            )}
          </p>
          <Label htmlFor="sign-up-username" className="sr-only">
            Username
          </Label>
          <Input
            id="sign-up-username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={inviteToken ? "your_username" : "unique_username"}
            required
            minLength={3}
            maxLength={32}
            autoFocus
          />
          {!usernameReady && username.trim() ? (
            <div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <p className="font-medium text-destructive">Enter a valid username to continue.</p>
              <div className="space-y-1.5 text-muted-foreground">
                <p>Use 3–32 characters with this pattern:</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  <li>Lowercase letters, numbers, underscores, or hyphens only</li>
                  <li>Must start and end with a letter or number</li>
                  <li>No spaces or special characters</li>
                </ul>
                <p>
                  Examples:{" "}
                  <span className="font-mono text-foreground">unique_username</span>
                  {", "}
                  <span className="font-mono text-foreground">alex-22</span>
                  {", "}
                  <span className="font-mono text-foreground">r_smith</span>
                </p>
                <p>
                  Not valid:{" "}
                  <span className="font-mono">_jane</span>
                  {", "}
                  <span className="font-mono">jane-</span>
                  {", "}
                  <span className="font-mono">Jane Doe</span>
                </p>
              </div>
            </div>
          ) : null}
          {usernameReady && usernameStatus === "checking" ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking username…
            </p>
          ) : null}
          {usernameReady && usernameStatus === "taken" ? (
            <p className="text-xs font-medium text-destructive">
              That username is already taken. Choose another to continue.
            </p>
          ) : null}
          {usernameReady && usernameStatus === "available" ? (
            <p className={cn("text-xs font-medium", successTextClassName)}>Username is available.</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">
            {inviteToken ? (
              <>
                Continue with: <span className="text-destructive">*</span>
              </>
            ) : (
              <>
                2. Sign up with: <span className="text-destructive">*</span>
              </>
            )}
          </p>
          <SocialAuthButtons
            nextPath={postAuthPath}
            inviteToken={inviteToken || undefined}
            username={normalizedUsername}
            disabled={actionsDisabled}
          />
        </div>

        <div className="relative py-1 text-center uppercase text-muted-foreground">
          <span className="bg-card px-2 text-[0.9375rem] font-bold">or</span>
        </div>

        <EnterpriseSsoSignIn
          nextPath={postAuthPath}
          inviteToken={inviteToken || undefined}
          username={normalizedUsername}
          disabled={actionsDisabled}
        />

        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-2">
            <Label htmlFor="sign-up-email">Email</Label>
            <Input
              id="sign-up-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              readOnly={Boolean(inviteToken && prefillEmail)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sign-up-password">Password</Label>
            <PasswordInput
              id="sign-up-password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={actionsDisabled} className="gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {inviteToken ? "Create account" : "Create Organization"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href={signInHref as Route} className="font-medium text-foreground underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
