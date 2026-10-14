import posthog from "posthog-js";

export function isPostHogConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim());
}

export function isSentryConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());
}

export function captureAnalyticsEvent(
  event: string,
  properties?: Record<string, unknown>
): void {
  if (!isPostHogConfigured()) {
    return;
  }

  posthog.capture(event, properties);
}

export function identifyAnalyticsUser(input: {
  userId: string;
  email?: string | null;
  orgId?: string | null;
  role?: string | null;
}): void {
  if (!isPostHogConfigured()) {
    return;
  }

  posthog.identify(input.userId, {
    email: input.email ?? undefined,
    org_id: input.orgId ?? undefined,
    role: input.role ?? undefined
  });

  if (input.orgId) {
    posthog.group("organization", input.orgId);
  }
}

export function resetAnalyticsUser(): void {
  if (!isPostHogConfigured()) {
    return;
  }

  posthog.reset();
}
