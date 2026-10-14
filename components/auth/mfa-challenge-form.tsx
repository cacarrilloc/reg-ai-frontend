"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resetMfaFactorsForCurrentUser } from "@/lib/mfa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export { getMfaGateState, isMfaRequired, sessionNeedsMfa } from "@/lib/mfa";
export type { MfaGateState } from "@/lib/mfa";

type Props = {
  onVerified: () => void;
  onCancel?: () => void;
  /** After factors are cleared, show QR enrollment for this Auth environment. */
  onReenroll?: () => void;
};

/** Completes AAL2 with a verified TOTP authenticator factor. */
export function MfaChallengeForm({ onVerified, onCancel, onReenroll }: Props) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      if (!supabase) {
        setError("Authentication is not configured.");
        setIsLoading(false);
        return;
      }
      try {
        const { data, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError) {
          throw listError;
        }
        const totp = ((data?.totp ?? []) as Array<{ id: string; status: string }>).find(
          (factor) => factor.status === "verified"
        );
        if (!totp) {
          setError("No verified authenticator factor is available for this account.");
          return;
        }
        setFactorId(totp.id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load MFA factors.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase || !factorId) return;
    setIsBusy(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) {
        throw challengeError;
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) {
        throw verifyError;
      }
      onVerified();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invalid verification code.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSetupNewAuthenticator() {
    if (!onReenroll) return;
    setIsResetting(true);
    setError(null);
    try {
      await resetMfaFactorsForCurrentUser();
      onReenroll();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to clear the old authenticator. Try again or sign out."
      );
    } finally {
      setIsResetting(false);
    }
  }

  const reenrollButton = onReenroll ? (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={isBusy || isResetting}
      onClick={() => void handleSetupNewAuthenticator()}
    >
      {isResetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      Set up a new authenticator
    </Button>
  ) : null;

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing second factor…
      </p>
    );
  }

  if (!factorId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">
          {error ?? "No verified authenticator factor is available for this account."}
        </p>
        {reenrollButton}
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Back
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleVerify}>
      <p className="text-sm text-muted-foreground">
        Enter the 6-digit code from the authenticator:
      </p>
      <div className="grid gap-2">
        <Label htmlFor="mfa-challenge-code">Authenticator code</Label>
        <Input
          id="mfa-challenge-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="123456"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isBusy || isResetting || code.trim().length < 6} className="gap-2">
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Verify
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" disabled={isBusy || isResetting} onClick={onCancel}>
            Back
          </Button>
        ) : null}
      </div>
      {onReenroll ? (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            <strong>NOTE:</strong> Organizations use different Auth projects. A code from other authenticator
            will not work here. Please set up the QR for this organization if it is the first time joining:
        </p>
          {reenrollButton}
        </div>
      ) : null}
    </form>
  );
}
