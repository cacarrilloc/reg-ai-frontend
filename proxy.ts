import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Supabase session proxy (Next.js 16+ file convention).
 *
 * Route protection for the dashboard stays in app/(app)/layout.tsx (SignedInGate +
 * OrganizationGate). This file only refreshes the Supabase session cookie.
 */
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip Next internals, static assets, and the Sentry tunnel (/monitoring).
    "/((?!_next|backend-api|monitoring|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
