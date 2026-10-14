"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BillingStatusResponse = {
  plan_code: string | null;
  status: "active" | "trialing" | "past_due" | "canceled" | "inactive" | "none" | string;
  current_period_end: string | null;
  cancel_at_period_end?: boolean;
};

type CheckoutResponse = { checkout_url: string };
type PortalResponse = { portal_url: string };

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

/** Subscription plan status plus Stripe checkout / billing-portal launch buttons. */
export function BillingSettingsCard() {
  const { authState, getAuthToken, orgId } = useBackendAuth();
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"monthly" | "annual" | "portal" | null>(null);

  const loadStatus = useCallback(async () => {
    if (authState !== "ready") {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const response = await apiFetch<BillingStatusResponse>("/api/v1/billing/status", undefined, {
        token,
        orgId
      });
      setStatus(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load billing status.");
    } finally {
      setIsLoading(false);
    }
  }, [authState, getAuthToken, orgId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function startCheckout(interval: "monthly" | "annual") {
    setPendingAction(interval);
    setError(null);
    try {
      const token = await getAuthToken();
      const origin = window.location.origin;
      const planCode = interval === "annual" ? "annual" : "monthly";
      const response = await apiFetch<CheckoutResponse>(
        "/api/v1/billing/checkout-session",
        {
          method: "POST",
          body: JSON.stringify({
            plan_code: planCode,
            success_url: `${origin}/settings?billing=success`,
            cancel_url: `${origin}/settings?billing=cancelled`
          })
        },
        { token, orgId }
      );
      window.location.href = response.checkout_url;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start checkout.");
      setPendingAction(null);
    }
  }

  async function openPortal() {
    setPendingAction("portal");
    setError(null);
    try {
      const token = await getAuthToken();
      const response = await apiFetch<PortalResponse>(
        "/api/v1/billing/portal-session",
        {
          method: "POST",
          body: JSON.stringify({ return_url: `${window.location.origin}/settings` })
        },
        { token, orgId }
      );
      window.location.href = response.portal_url;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open the billing portal.");
      setPendingAction(null);
    }
  }

  const periodEnd = formatDate(status?.current_period_end ?? null);
  const hasActiveSubscription = status?.status === "active" || status?.status === "trialing";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" />
          Billing &amp; subscription
        </CardTitle>
        <CardDescription>Manage your Reg-AI subscription plan and payment method.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading billing status…
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="capitalize">
              {status?.plan_code || "No plan"}
            </Badge>
            <Badge
              variant="outline"
              className={hasActiveSubscription ? "border-transparent bg-foreground text-background" : undefined}
            >
              {status?.status ?? "none"}
            </Badge>
            {periodEnd ? (
              <span className="text-sm text-muted-foreground">
                {status?.status === "canceled" ? "Access ends" : "Renews"} {periodEnd}
              </span>
            ) : null}
          </div>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            variant="outline"
            className="gap-2"
            disabled={pendingAction !== null}
            onClick={() => void startCheckout("monthly")}
          >
            {pendingAction === "monthly" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Upgrade monthly
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            disabled={pendingAction !== null}
            onClick={() => void startCheckout("annual")}
          >
            {pendingAction === "annual" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Upgrade annual
          </Button>
          {hasActiveSubscription ? (
            <Button className="gap-2" disabled={pendingAction !== null} onClick={() => void openPortal()}>
              {pendingAction === "portal" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Manage billing
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
