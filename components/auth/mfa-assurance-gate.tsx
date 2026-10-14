"use client";

import type { Route } from "next";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getMfaGateState, isMfaRequired, type MfaGateState } from "@/lib/mfa";
import { isAuthConfigured } from "@/lib/auth";

/**
 * Blocks app access until MFA is enrolled and the session is AAL2.
 * Allows /settings so users can manage factors after enrollment if needed.
 */
export function MfaAssuranceGate({ children }: { children: React.ReactNode }) {
  if (!isAuthConfigured() || !isMfaRequired()) {
    return children;
  }

  return (
    <Suspense fallback={<MfaGateLoading />}>
      <SupabaseMfaAssuranceGate>{children}</SupabaseMfaAssuranceGate>
    </Suspense>
  );
}

function MfaGateLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Checking multi-factor authentication…
    </div>
  );
}

function SupabaseMfaAssuranceGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const state: MfaGateState = await getMfaGateState();
      if (cancelled) return;

      if (state === "ok") {
        setAllowed(true);
        return;
      }

      // Settings remains reachable only after MFA is complete; enrollment/challenge
      // always happens on /mfa so the rest of the product stays locked.
      const query = searchParams.toString();
      const next = `${pathname}${query ? `?${query}` : ""}`;
      const params = new URLSearchParams({ next, mode: state });
      router.replace(`/mfa?${params.toString()}` as Route);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams]);

  if (!allowed) {
    return <MfaGateLoading />;
  }

  return children;
}
