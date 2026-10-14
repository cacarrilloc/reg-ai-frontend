"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, successTextClassName } from "@/lib/utils";

type NewsletterInviteResponse = {
  status: string;
  email: string;
};

type NewsletterInviteCardProps = {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
};

export function NewsletterInviteCard({
  authState = "ready",
  getAuthToken,
  orgId,
}: NewsletterInviteCardProps) {
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canSend = authState === "ready";

  async function sendInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) {
      return;
    }
    setIsSending(true);
    setMessage(null);
    setError(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        throw new Error("Sign in to send a newsletter invitation.");
      }
      const response = await apiFetch<NewsletterInviteResponse>(
        "/api/v1/newsletter/invites",
        {
          method: "POST",
          body: JSON.stringify({ email }),
        },
        { token, orgId }
      );
      setEmail("");
      setMessage(`Invitation sent to ${response.email}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send the invitation.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Card className="min-w-0 overflow-hidden bg-card">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Newsletter
          </p>
          <CardTitle>Invite people to the Reg-AI Newsletter</CardTitle>
          <CardDescription className="w-full min-w-0 max-w-full text-pretty text-sm leading-6">
            Share the Monday Regulatory Brief with colleagues, clients, and other compliance teams.
            Every invite puts Reg-AI in front of more of the industry and the public — a short SEC,
            FINRA, and CFTC briefing built from the feed below, sent every Monday.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => void sendInvitation(event)}>
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="newsletter-invite-email">Invite by email</Label>
            <Input
              id="newsletter-invite-email"
              type="email"
              autoComplete="email"
              placeholder="colleague@firm.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={!canSend || isSending}
              required
            />
          </div>
          <Button type="submit" className="gap-2" disabled={!canSend || isSending || !email.trim()}>
            {isSending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            Send invitation
          </Button>
        </form>
        {authState !== "ready" ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Sign in to invite readers from this organization.
          </p>
        ) : null}
        {message ? (
          <p className={cn("mt-3 text-sm", successTextClassName)}>{message}</p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
