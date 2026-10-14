import { createClient } from "@/lib/supabase/client";
import { isMfaRequired } from "@/lib/mfa-config";
import { apiFetch } from "@/lib/api";

export type MfaGateState = "ok" | "enroll" | "challenge";
export { isMfaRequired };

type TotpFactorLike = {
  id: string;
  status: string;
};

/**
 * Determines whether the current Supabase session may enter the app.
 * - enroll: no verified TOTP factor yet
 * - challenge: factor enrolled but session is still AAL1
 * - ok: AAL2 (or MFA not required)
 */
export async function getMfaGateState(): Promise<MfaGateState> {
  if (!isMfaRequired()) {
    return "ok";
  }

  const supabase = createClient();
  if (!supabase) {
    return "ok";
  }

  const [{ data: factors, error: factorsError }, { data: aal, error: aalError }] =
    await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);

  if (factorsError || aalError || !aal) {
    // Fail closed when MFA is required and we cannot evaluate assurance.
    return "enroll";
  }

  const totpFactors = (factors?.totp ?? []) as TotpFactorLike[];
  const hasVerifiedTotp = totpFactors.some((factor) => factor.status === "verified");
  if (!hasVerifiedTotp) {
    return "enroll";
  }

  if (aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
    return "challenge";
  }

  return "ok";
}

/** @deprecated Prefer getMfaGateState(); kept for existing call sites. */
export async function sessionNeedsMfa(): Promise<boolean> {
  const state = await getMfaGateState();
  return state === "challenge" || state === "enroll";
}

/**
 * Clears MFA factors for this Auth environment via the backend (service role).
 * Needed because client unenroll of verified factors requires AAL2.
 */
export async function resetMfaFactorsForCurrentUser(): Promise<number> {
  const supabase = createClient();
  if (!supabase) {
    throw new Error("Authentication is not configured.");
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error("You must be signed in to reset authenticator setup.");
  }
  const result = await apiFetch<{ deleted_factors: number }>(
    "/api/v1/auth/me/mfa/reset",
    { method: "POST" },
    { token, timeoutMs: 20_000 }
  );
  return result.deleted_factors;
}
