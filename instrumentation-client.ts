import * as Sentry from "@sentry/nextjs";

const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.VERCEL_ENV;
const sentryEnabled =
  process.env.SENTRY_ENABLED === "true" ||
  appEnv === "production" ||
  appEnv === "staging" ||
  process.env.VERCEL === "1";

if (sentryEnabled && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: appEnv ?? "local",
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.2),
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
