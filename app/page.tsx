"use client";

import type { Route } from "next";
import Link from "next/link";
import { AuthControls } from "@/components/auth/auth-controls";
import { FreeAuditButton } from "@/components/auth/free-audit-button";
import { LandingShareButtons } from "@/components/auth/landing-share-buttons";
import { ProductWordmark } from "@/components/auth/product-wordmark";
import { useAuthSession } from "@/components/auth/auth-session";
import { isAuthConfigured } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { AUTH_FRAME_CLASS } from "@/components/auth/auth-frame";
import { AppLegalFooter } from "@/components/brand/app-legal-footer";
import { LoginBackground } from "@/components/auth/login-background";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const { isLoaded, isSignedIn } = useAuthSession();
  const authConfigured = isAuthConfigured();
  // Local no-auth mode (Supabase env unset) should still reach the dashboard.
  const showDashboard = !authConfigured || (isLoaded && isSignedIn);
  const showSignInHint = authConfigured && isLoaded && !isSignedIn;

  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-hidden px-6 pb-4 pt-6">
      <LoginBackground priority />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 py-4">
        <div className="flex w-full max-w-3xl flex-col items-center gap-3">
          <LandingShareButtons />
          <Card className={cn("w-full", AUTH_FRAME_CLASS)}>
            <CardHeader className="space-y-4 text-center">
              <div>
                <CardTitle className="leading-tight">
                  <ProductWordmark size="lg" />
                </CardTitle>
                <CardDescription className="mt-2 text-base">
                  {
                    "Monitor FINRA, SEC, and CFTC regulation changes in real time and compare them against your organization's internal policies, business changes, and marketing reviews of homepages, emails, decks, blogs, and social posts."
                  }
                  <br />
                  <br />
                  Our Reg-AI agents will draft gap analyses and tracked redlines for your CCO sign-off and keep the
                  review trail as exam-ready audit evidence.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <AuthControls />
              {showSignInHint ? (
                <p className="text-sm text-muted-foreground">Sign up to create your Organization</p>
              ) : null}
              {showDashboard ? (
                <Button asChild size="lg">
                  <Link href={"/dashboard" as Route}>Open Dashboard</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
        {showSignInHint ? <FreeAuditButton /> : null}
      </div>
      <AppLegalFooter className="relative z-10 w-full" />
    </main>
  );
}
