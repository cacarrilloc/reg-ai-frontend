/** Shared client-side password rules (aligned with sign-up minLength=8). */

export const MIN_PASSWORD_LENGTH = 8;

export function validateNewPassword(password: string): string | null {
  const value = password.trim();
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function validatePasswordConfirmation(
  password: string,
  confirmation: string
): string | null {
  if (password !== confirmation) {
    return "Passwords do not match.";
  }
  return null;
}
