"use client";

import type { Route } from "next";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";
import { useAuthSession } from "@/components/auth/auth-session";
import { MfaSettingsCard } from "@/components/settings/mfa-settings-card";
import { isAuthConfigured } from "@/lib/auth";
import { safeNextPath } from "@/lib/auth-redirect";
import { getMfaGateState, type MfaGateState } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function MfaPage() {
  if (!isAuthConfigured()) {
    return (
      <AuthPageShell title="Two-factor authentication">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Authentication is not configured</h1>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell title="Two-factor authentication" className="max-w-lg">
      <Suspense
        fallback={
          <div className="flex min-h-[20vh] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading…
          </div>
        }
      >
        <MfaChallengePage />
      </Suspense>
    </AuthPageShell>
  );
}

function MfaChallengePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const fromInvite = searchParams.get("from") === "invite";
  const { isLoaded, isSignedIn } = useAuthSession();
  const [gateState, setGateState] = useState<MfaGateState | null>(null);

  async function refreshGate() {
    const state = await getMfaGateState();
    if (state === "ok") {
      router.replace(nextPath as Route);
      router.refresh();
      return;
    }
    setGateState(state);
  }

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      const params = new URLSearchParams({ next: nextPath });
      router.replace(`/sign-in?${params.toString()}` as Route);
      return;
    }
    void refreshGate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evaluate once session is ready
  }, [isLoaded, isSignedIn, nextPath, router]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase?.auth.signOut();
    router.replace("/sign-in" as Route);
  }

  if (!isLoaded || gateState === null) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (gateState === "enroll") {
    return (
      <div className="w-full max-w-lg space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              {fromInvite ? "Last step: set up your authenticator" : "Set up multi-factor authentication"}
            </CardTitle>
            <CardDescription className="space-y-2">
              <span className="block">
                {fromInvite
                  ? "Your invite is accepted. Before you can use Reg-AI, install an authenticator app and scan the QR code below."
                  : "Reg-AI requires an authenticator app (Google Authenticator, 2FAS, 1Password, etc.) before you can continue."}
              </span>
              <span className="block font-medium text-foreground">
                You’ll need a fresh 6-digit code from this app every time you sign in.
              </span>
            </CardDescription>
          </CardHeader>
        </Card>
        <MfaSettingsCard
          required
          autoStart
          onEnrolled={() => {
            void refreshGate();
          }}
        />
        <Button type="button" variant="ghost" className="w-full" onClick={() => void handleSignOut()}>
          Sign out
        </Button>
      </div>
    );
  }

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
      <CardContent className="space-y-4">
        <MfaChallengeForm
          onVerified={() => {
            router.push(nextPath as Route);
            router.refresh();
          }}
          onCancel={() => void handleSignOut()}
          onReenroll={() => {
            void refreshGate();
          }}
        />
        <Button type="button" variant="ghost" className="w-full" onClick={() => void handleSignOut()}>
          Sign out
        </Button>
      </CardContent>
    </Card>
  );
}
