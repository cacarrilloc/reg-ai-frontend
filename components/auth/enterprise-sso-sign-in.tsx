"use client";

import { useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import {
  extractInviteTokenFromNext,
  rememberPendingInviteToken,
} from "@/lib/pending-invite";
import { createClient } from "@/lib/supabase/client";
import { fetchSsoLoginPolicy, isSsoUiEnabled } from "@/lib/sso";
import {
  assertUsernameAvailable,
  isValidUsernameFormat,
  normalizeUsername,
} from "@/lib/user-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  nextPath: string;
  disabled?: boolean;
  username?: string;
  inviteToken?: string;
};

function ssoRedirectTo(nextPath: string, username?: string, inviteToken?: string): string {
  const resolvedInvite =
    (inviteToken || "").trim() || extractInviteTokenFromNext(nextPath) || "";
  if (typeof window === "undefined") {
    const params = new URLSearchParams({
      next: resolvedInvite ? "/join" : nextPath,
    });
    if (username) {
      params.set("username", username);
    }
    if (resolvedInvite) {
      params.set("invite_token", resolvedInvite);
    }
    return `/auth/callback?${params.toString()}`;
  }
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", resolvedInvite ? "/join" : nextPath);
  if (username) {
    url.searchParams.set("username", username);
  }
  if (resolvedInvite) {
    rememberPendingInviteToken(resolvedInvite);
    url.searchParams.set("invite_token", resolvedInvite);
  }
  return url.toString();
}

/** Corporate SAML/OIDC SSO via email domain (`signInWithSSO`). */
export function EnterpriseSsoSignIn({ nextPath, disabled, username, inviteToken }: Props) {
  const [email, setEmail] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSsoUiEnabled()) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setError("Authentication is not configured.");
      return;
    }
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      setError("Enter your work email address.");
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const isSignUpFlow = username !== undefined;
      let reserved: string | undefined;
      if (isSignUpFlow) {
        reserved = normalizeUsername(username || "");
        if (!reserved || !isValidUsernameFormat(reserved)) {
          setError("Choose a valid username above before continuing with SSO.");
          return;
        }
        await assertUsernameAvailable(reserved);
      }

      const policy = await fetchSsoLoginPolicy(trimmed);
      if (!policy.domain) {
        setError("Enter a valid work email.");
        return;
      }
      if (!policy.sso_available) {
        setError(
          `Single sign-on is not configured for ${policy.domain}. Ask your admin to connect your identity provider in Organization Settings.`
        );
        return;
      }

      const { data, error: ssoError } = await supabase.auth.signInWithSSO({
        domain: policy.domain,
        options: {
          redirectTo: ssoRedirectTo(nextPath, reserved, inviteToken),
        },
      });
      if (ssoError) {
        throw ssoError;
      }
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }
      setError("SSO redirect URL was not returned. Confirm SAML is enabled in Supabase.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start corporate SSO.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <form className="grid gap-3 rounded-md border p-3" onSubmit={handleSubmit}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Building2 className="h-4 w-4" />
        Corporate SSO
      </div>
      <div className="grid gap-2">
        <Label htmlFor="enterprise-sso-email">Work email</Label>
        <Input
          id="enterprise-sso-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" variant="outline" disabled={disabled || isBusy} className="gap-2">
        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Continue with SSO
      </Button>
    </form>
  );
}
