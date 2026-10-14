"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMfaGateState } from "@/lib/mfa";
import {
  MIN_PASSWORD_LENGTH,
  validateNewPassword,
  validatePasswordConfirmation,
} from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

/** Change password while signed in (email/password accounts). */
export function PasswordSettingsCard() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setError("Authentication is not configured.");
      return;
    }

    const passwordError = validateNewPassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    const confirmError = validatePasswordConfirmation(newPassword, confirmPassword);
    if (confirmError) {
      setError(confirmError);
      return;
    }
    if (currentPassword === newPassword) {
      setError("Choose a password that is different from your current one.");
      return;
    }

    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }
      const email = (user?.email || "").trim().toLowerCase();
      if (!email) {
        throw new Error(
          "This account has no email/password credential. Use your SSO provider to manage sign-in."
        );
      }

      // Re-auth proves knowledge of the current password. This can drop MFA to AAL1;
      // we restore the gate below after the password update.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (verifyError) {
        throw new Error("Current password is incorrect.");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword.trim(),
      });
      if (updateError) {
        throw updateError;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      const mfaState = await getMfaGateState();
      if (mfaState === "challenge" || mfaState === "enroll") {
        const params = new URLSearchParams({ next: "/settings", mode: mfaState });
        router.push(`/mfa?${params.toString()}` as Route);
        return;
      }

      setMessage("Password updated. Use the new password the next time you sign in.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update password.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5" />
          Password
        </CardTitle>
        <CardDescription>
          Change the password for this account. SSO-only accounts manage credentials with their
          identity provider.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid max-w-md gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="settings-new-password">New password</Label>
            <PasswordInput
              id="settings-new-password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="settings-confirm-password">Confirm new password</Label>
            <PasswordInput
              id="settings-confirm-password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>
          ) : null}
          <div>
            <Button type="submit" disabled={isBusy} className="gap-2">
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Update password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
