import { SignedInGate } from "@/components/auth/signed-in-gate";
import { MfaAssuranceGate } from "@/components/auth/mfa-assurance-gate";
import { OrganizationGate } from "@/components/auth/organization-gate";
import { AppWatermark } from "@/components/brand/app-watermark";

/**
 * Shared layout for authenticated app routes (dashboard, reviews, etc.).
 * Sign-in + an active organization membership are both required.
 */
export default function AuthenticatedAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SignedInGate>
      <MfaAssuranceGate>
        <OrganizationGate>
          <div className="relative isolate min-h-screen">
            <AppWatermark />
            {children}
          </div>
        </OrganizationGate>
      </MfaAssuranceGate>
    </SignedInGate>
  );
}
