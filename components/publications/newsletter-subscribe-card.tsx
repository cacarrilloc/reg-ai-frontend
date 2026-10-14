"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, successIconClassName, successTextClassName } from "@/lib/utils";

type SubscribeResponse = {
  status: string;
  email: string;
  already_subscribed?: boolean;
};

export function NewsletterSubscribeCard() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedEmail, setAcceptedEmail] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    setIsSubmitting(true);
    setError(null);
    void apiFetch<SubscribeResponse>("/api/v1/newsletter/subscribe", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setAcceptedEmail(response.email);
        setAlreadySubscribed(Boolean(response.already_subscribed));
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to accept this invitation.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSubmitting(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function subscribe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setInvitedEmail(null);
    try {
      const response = await apiFetch<SubscribeResponse>("/api/v1/newsletter/subscribe", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setEmail("");
      setInvitedEmail(response.email);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send the invitation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const heading = acceptedEmail
    ? alreadySubscribed
      ? "You are already on the list"
      : "You are subscribed"
    : invitedEmail
      ? "Invitation sent"
      : token
        ? "You're invited — welcome in"
        : "Subscribe to the Reg-AI Newsletter";

  return (
    <div className="min-w-0 space-y-4 border-t border-border pt-6">
      <div className="min-w-0 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Newsletter
        </p>
        <h3
          className={cn(
            "text-lg font-semibold leading-none tracking-tight",
            acceptedEmail || invitedEmail ? successTextClassName : undefined
          )}
        >
          {heading}
        </h3>
        <p className="w-full min-w-0 max-w-full text-pretty text-sm leading-6 text-muted-foreground">
          {acceptedEmail ? (
            <>
              {acceptedEmail} will receive the Monday brief: AI summaries of SEC, FINRA, and CFTC
              publications from the past week, built from the feed below.
            </>
          ) : invitedEmail ? (
            <>
              We emailed an invitation to {invitedEmail}. Open that message and accept it to join
              the list — we will not add the address until then.
            </>
          ) : (
            <>
              Hello! We would love to have you. Every Monday we send a short Regulatory Brief built
              from the same SEC, FINRA, and CFTC publications in the Reg-AI feed: AI summaries of
              what each agency released last week, who is affected, and why a compliance team should
              care.
            </>
          )}
        </p>
      </div>
      {acceptedEmail ? (
        <p className={cn("flex items-center gap-2 text-sm", successTextClassName)}>
          <CheckCircle2 className={cn("h-4 w-4", successIconClassName)} aria-hidden />
          You will get the next Monday briefing at this address.
        </p>
      ) : invitedEmail ? (
        <p className={cn("flex items-center gap-2 text-sm", successTextClassName)}>
          <CheckCircle2 className={cn("h-4 w-4", successIconClassName)} aria-hidden />
          Invitation sent to {invitedEmail}.
        </p>
      ) : token && !error ? (
        <p className="flex items-center text-sm text-muted-foreground">
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isSubmitting ? "Confirming your invitation…" : "Almost there."}
        </p>
      ) : (
        <div className="space-y-3">
          {token && error ? (
            <p className="text-sm text-muted-foreground">
              You can still subscribe with your email if the invitation link is no longer valid.
            </p>
          ) : null}
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => void subscribe(event)}
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="newsletter-subscribe-email">Work email</Label>
              <Input
                id="newsletter-subscribe-email"
                type="email"
                autoComplete="email"
                placeholder="you@firm.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
            <Button type="submit" className="gap-2" disabled={isSubmitting || !email.trim()}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Subscribe
            </Button>
          </form>
        </div>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
