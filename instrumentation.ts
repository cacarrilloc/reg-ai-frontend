import * as Sentry from "@sentry/nextjs";

function sentryEnabledInRuntime(): boolean {
  if (process.env.SENTRY_ENABLED === "true") {
    return true;
  }
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.VERCEL_ENV;
  return appEnv === "production" || appEnv === "staging" || process.env.VERCEL === "1";
}

export async function register() {
  if (!sentryEnabledInRuntime()) {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
