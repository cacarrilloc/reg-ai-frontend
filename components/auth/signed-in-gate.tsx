"use client";

import type { Route } from "next";
import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthSession } from "@/components/auth/auth-session";
import { isAuthConfigured } from "@/lib/auth";

/**
 * Client-side signed-in gate for App Router pages that are Client Components.
 * When Supabase is not configured (local no-auth mode), children render normally.
 */
export function SignedInGate({ children }: { children: React.ReactNode }) {
  if (!isAuthConfigured()) {
    return children;
  }

  return (
    <Suspense fallback={<SignedInGateLoading />}>
      <SupabaseSignedInGate>{children}</SupabaseSignedInGate>
    </Suspense>
  );
}

function SignedInGateLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Loading…
    </div>
  );
}

function SupabaseSignedInGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuthSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      const query = searchParams.toString();
      const next = `${pathname}${query ? `?${query}` : ""}`;
      const params = new URLSearchParams({ next });
      router.replace(`/sign-in?${params.toString()}` as Route);
    }
  }, [isLoaded, isSignedIn, pathname, router, searchParams]);

  if (!isLoaded || !isSignedIn) {
    return <SignedInGateLoading />;
  }

  return children;
}
