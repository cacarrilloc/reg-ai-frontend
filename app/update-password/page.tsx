"use client";

import type { Route } from "next";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { useAuthSession } from "@/components/auth/auth-session";
import { isAuthConfigured } from "@/lib/auth";
import { safeNextPath } from "@/lib/auth-redirect";
import {
  MIN_PASSWORD_LENGTH,
  validateNewPassword,
  validatePasswordConfirmation,
} from "@/lib/password";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export default function UpdatePasswordPage() {
  if (!isAuthConfigured()) {
    return (
      <AuthPageShell title="Set new password">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Authentication is not configured</h1>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell title="Set new password">
      <Suspense
        fallback={
          <div className="flex min-h-[20vh] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading…
          </div>
        }
      >
        <UpdatePasswordForm />
      </Suspense>
    </AuthPageShell>
  );
}

function UpdatePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const afterPath = safeNextPath(searchParams.get("after") || searchParams.get("next"), "/dashboard");
  const { isLoaded, isSignedIn } = useAuthSession();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [waitTimedOut, setWaitTimedOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setWaitTimedOut(true), 8_000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    // Supabase fires PASSWORD_RECOVERY after the email link establishes a session.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setRecoveryReady(true);
      }
    });

    void supabase.auth
      .getSession()
      .then(({ data }: Awaited<ReturnType<typeof supabase.auth.getSession>>) => {
        if (data.session) {
          setRecoveryReady(true);
        }
      });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setError("Authentication is not configured.");
      return;
    }

    const passwordError = validateNewPassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    const confirmError = validatePasswordConfirmation(password, confirm);
    if (confirmError) {
      setError(confirmError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password.trim(),
      });
      if (updateError) {
        throw updateError;
      }
      router.replace(afterPath as Route);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isLoaded || (!isSignedIn && !recoveryReady && !waitTimedOut)) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Preparing reset…</CardTitle>
          <CardDescription>
            Completing the secure link from your email. If this takes more than a few seconds, request
            a new reset link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for session…
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href={"/forgot-password" as Route}>Request a new link</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!isSignedIn) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset link expired</CardTitle>
          <CardDescription>
            This password reset session is no longer valid. Request a new email link to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href={"/forgot-password" as Route}>Forgot password</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Choose a new password
        </CardTitle>
        <CardDescription>
          Enter a new password for your Reg-AI account (at least {MIN_PASSWORD_LENGTH} characters).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={isSubmitting} className="gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Save password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
