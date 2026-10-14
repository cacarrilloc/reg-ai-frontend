"use client";

import type { Route } from "next";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { isAuthConfigured } from "@/lib/auth";
import { safeNextPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/client";
import { looksLikeEmail, resolveLoginEmail } from "@/lib/user-profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  if (!isAuthConfigured()) {
    return (
      <AuthPageShell title="Forgot password">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Authentication is not configured</h1>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell title="Forgot password">
      <Suspense
        fallback={
          <div className="flex min-h-[20vh] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading…
          </div>
        }
      >
        <ForgotPasswordForm />
      </Suspense>
    </AuthPageShell>
  );
}

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const prefill = (searchParams.get("email") || "").trim();
  const nextPath = safeNextPath(searchParams.get("next"), "/update-password");

  const [identifier, setIdentifier] = useState(prefill);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

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
          // Avoid account enumeration — still show the success state.
          setSent(true);
          return;
        }
      }

      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", "/update-password");
      if (nextPath && nextPath !== "/update-password") {
        redirectTo.searchParams.set("after", nextPath);
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo.toString(),
      });
      if (resetError) {
        throw resetError;
      }
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send reset email.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sent) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Check your email
          </CardTitle>
          <CardDescription>
            If an account exists for that username or email, we sent a link to choose a new
            password. The link expires after a short time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            After you open the link, you&apos;ll set a new password, then sign in as usual (including
            your authenticator code if MFA is enabled).
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href={"/sign-in" as Route}>Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter the organization name or email for your account. We will email a secure reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="forgot-identifier">Username or email</Label>
            <Input
              id="forgot-identifier"
              type="text"
              autoComplete="username"
              inputMode="email"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="username or you@firm.com"
              required
              autoFocus
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={isSubmitting} className="gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send reset link
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link href={"/sign-in" as Route} className="font-medium text-foreground underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
