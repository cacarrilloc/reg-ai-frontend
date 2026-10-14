"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { resetMfaFactorsForCurrentUser } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FactorStatus = "verified" | "unverified";

type TotpFactor = {
  id: string;
  friendly_name?: string | null;
  status: FactorStatus;
};

type TotpEnrollState = {
  factorId: string;
  qrCode: string;
  secret: string;
};

const TWO_FAS_IOS = "https://apps.apple.com/app/2fa-authenticator-2fas/id1217793794";
const TWO_FAS_ANDROID = "https://play.google.com/store/apps/details?id=com.twofasapp";
const TWO_FAS_WEB = "https://2fas.com/auth/";

function twoFasAuthDownloadUrl(): string {
  if (typeof navigator === "undefined") {
    return TWO_FAS_WEB;
  }
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) {
    return TWO_FAS_ANDROID;
  }
  if (/iPad|iPhone|iPod/i.test(ua)) {
    return TWO_FAS_IOS;
  }
  return TWO_FAS_WEB;
}

/** Authenticator-app (TOTP) enrollment using supabase.auth.mfa. */
export function MfaSettingsCard({
  required = false,
  autoStart = false,
  onEnrolled,
}: {
  /** When true, users cannot remove their last verified authenticator. */
  required?: boolean;
  /** When true, start QR enrollment automatically if nothing is verified yet. */
  autoStart?: boolean;
  onEnrolled?: () => void;
} = {}) {
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollState | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [autoStartAttempted, setAutoStartAttempted] = useState(false);
  const authenticatorAppHref = useMemo(() => twoFasAuthDownloadUrl(), []);

  const loadFactors = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        throw listError;
      }
      setFactors((data?.totp ?? []) as TotpFactor[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load MFA factors.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFactors();
  }, [loadFactors]);

  const startEnrollment = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    setEnrollment(null);
    try {
      try {
        await resetMfaFactorsForCurrentUser();
      } catch {
        // Local/dev may lack Admin reset; still drop any factors the client can see.
      }
      await supabase.auth.refreshSession();

      const { data: listed } = await supabase.auth.mfa.listFactors();
      const remaining = new Map<string, TotpFactor>();
      for (const factor of [
        ...(((listed as { all?: TotpFactor[] } | null)?.all ?? []) as TotpFactor[]),
        ...((listed?.totp ?? []) as TotpFactor[]),
      ]) {
        if (factor.id) {
          remaining.set(factor.id, factor);
        }
      }
      for (const factor of remaining.values()) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Reg-AI ${window.location.host}`,
        // Without this, GoTrue uses Auth Site URL host (often localhost:3000).
        issuer: window.location.host,
      });
      if (enrollError) {
        throw enrollError;
      }
      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setVerificationCode("");
      await loadFactors();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start authenticator enrollment.");
    } finally {
      setIsBusy(false);
    }
  }, [loadFactors]);

  useEffect(() => {
    if (!autoStart || autoStartAttempted || isLoading || enrollment || isBusy) {
      return;
    }
    const hasVerified = factors.some((factor) => factor.status === "verified");
    if (hasVerified) {
      return;
    }
    setAutoStartAttempted(true);
    void startEnrollment();
  }, [autoStart, autoStartAttempted, enrollment, factors, isBusy, isLoading, startEnrollment]);

  async function confirmEnrollment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase || !enrollment) return;
    setIsBusy(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrollment.factorId,
      });
      if (challengeError) {
        throw challengeError;
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollment.factorId,
        challengeId: challenge.id,
        code: verificationCode.trim(),
      });
      if (verifyError) {
        throw verifyError;
      }
      setMessage("Authenticator app two-factor authentication is now enabled.");
      setEnrollment(null);
      setVerificationCode("");
      await loadFactors();
      onEnrolled?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to verify the code. Try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function removeFactor(factorId: string) {
    if (required) {
      setError("Multi-factor authentication is required. You cannot remove your only authenticator.");
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    setIsBusy(true);
    setError(null);
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
      if (unenrollError) {
        throw unenrollError;
      }
      setMessage("Authenticator app was removed.");
      await loadFactors();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove this factor.");
    } finally {
      setIsBusy(false);
    }
  }

  const verifiedTotp = factors.find((factor) => factor.status === "verified");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5" />
          Two-factor authentication
        </CardTitle>
        <CardDescription>
          {required
            ? "An authenticator app is required for all Reg-AI accounts."
            : "Add an authenticator app as a second sign-in factor."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || (autoStart && isBusy && !enrollment && !error) ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing authenticator setup…
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p> : null}

        {!isLoading && verifiedTotp && !enrollment ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border p-3">
              <span className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Authenticator app enabled
              </span>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={isBusy || required}
                onClick={() => void removeFactor(verifiedTotp.id)}
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Next time you sign in: email/password (or SSO), then the 6-digit code from this app.
            </p>
          </div>
        ) : null}

        {!isLoading && !verifiedTotp && !enrollment && !(autoStart && isBusy && !error) ? (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                Install an{" "}
                <a
                  href={authenticatorAppHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  authenticator app
                </a>
                .
              </li>
              <li>Scan the QR code we show next.</li>
              <li>Enter the 6-digit code to finish setup.</li>
            </ol>
            <Button className="gap-2" disabled={isBusy} onClick={() => void startEnrollment()}>
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {error ? "Try setup again" : "Enable authenticator app"}
            </Button>
          </div>
        ) : null}

        {enrollment ? (
          <form className="grid gap-3 rounded-md border p-4" onSubmit={confirmEnrollment}>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                Open your{" "}
                <a
                  href={authenticatorAppHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
                >
                  authenticator app
                </a>{" "}
                and add a new account.
              </li>
              <li>Scan this QR code (or enter the secret manually).</li>
              <li>
                Enter the current 6-digit code below to <span className="text-foreground">enable</span>{" "}
                MFA — this confirms the app is linked. You will use a new code from the same app on
                every later sign-in.
              </li>
            </ol>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrollment.qrCode}
              alt="TOTP QR code"
              className="h-40 w-40 rounded-md border bg-white p-2"
            />
            <p className="break-all text-xs text-muted-foreground">Secret: {enrollment.secret}</p>
            <div className="grid max-w-xs gap-2">
              <Label htmlFor="mfa-code">Code from authenticator app</Label>
              <Input
                id="mfa-code"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value)}
                placeholder="123456"
                inputMode="numeric"
                maxLength={6}
                required
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={isBusy || verificationCode.trim().length < 6}
                className="gap-2"
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Verify &amp; enable
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={() => void startEnrollment()}
              >
                Try setup again
              </Button>
              {!required ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => setEnrollment(null)}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
