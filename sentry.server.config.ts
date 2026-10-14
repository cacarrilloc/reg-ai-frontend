// This file configures the initialization of Sentry on the server.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.VERCEL_ENV ?? "local";
const sentryEnabled =
  process.env.SENTRY_ENABLED === "true" ||
  appEnv === "production" ||
  appEnv === "staging" ||
  process.env.VERCEL === "1";

if (sentryEnabled && dsn) {
  Sentry.init({
    dsn,
    environment: appEnv,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.2),
  });
}
