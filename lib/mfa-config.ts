/**
 * MFA is required for all signed-in app access unless explicitly disabled.
 * Set NEXT_PUBLIC_MFA_REQUIRED=false only for local break-glass testing.
 */
export function isMfaRequired(): boolean {
  return process.env.NEXT_PUBLIC_MFA_REQUIRED !== "false";
}
