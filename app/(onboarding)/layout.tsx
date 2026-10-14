import { SignedInGate } from "@/components/auth/signed-in-gate";

/**
 * Signed-in routes that do not require an active organization yet
 * (organization select / create onboarding).
 */
export default function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <SignedInGate>{children}</SignedInGate>;
}
