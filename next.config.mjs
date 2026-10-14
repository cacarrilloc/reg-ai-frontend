import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isProductionLike =
  process.env.NEXT_PUBLIC_APP_ENV === "production" ||
  process.env.NEXT_PUBLIC_APP_ENV === "staging" ||
  process.env.VERCEL_ENV === "production" ||
  process.env.VERCEL_ENV === "preview";

const backendApiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");

function hostedBackendRewrites() {
  if (!backendApiBaseUrl) {
    return [];
  }
  try {
    const hostname = new URL(backendApiBaseUrl).hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    ) {
      return [];
    }
  } catch {
    return [];
  }
  return [
    {
      source: "/backend-api/:path*",
      destination: `${backendApiBaseUrl}/:path*`,
    },
  ];
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-XSS-Protection", value: "0" },
  // Do not set Cross-Origin-Opener-Policy here: COOP same-origin breaks
  // Supabase auth session refresh / OAuth window flows in local and hosted apps.
  ...(isProductionLike
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next blocks cross-origin /_next/* in dev unless listed here.
  // 192.0.0.2 often appears via local proxies / IDE preview tunnels.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.4.30",
    "192.0.0.2",
    ...(process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []),
  ],
  // Standalone is for Docker/self-hosting. On Vercel it can break NFT file tracing
  // (ENOENT next-server.js.nft.json). Keep Docker builds via absence of VERCEL=1.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  outputFileTracingRoot: __dirname,
  typedRoutes: true,
  experimental: {
    // Default is 10 MB. Pitch-deck PPTX uploads often exceed that when they
    // still hit /backend-api; multipart now goes direct, but keep this aligned.
    proxyClientMaxBodySize: "50mb",
  },
  // Next 16+ may auto-write AGENTS.md / CLAUDE.md; keep the repo clean.
  agentRules: false,
  // Avoid Turbopack duplicating @opentelemetry/api (Sentry) which floods
  // MaxListenersExceededWarning on ServerResponse.close in next dev.
  serverExternalPackages: ["@opentelemetry/api"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      // Adblockers commonly block paths containing "invite".
      {
        source: "/invite",
        destination: "/join",
        permanent: false,
      },
      {
        source: "/gap-analyses",
        destination: "/compliance-gaps",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return hostedBackendRewrites();
  },
};

// Sentry's Turbopack/OTel hooks flood MaxListenersExceededWarning in `next dev`.
// Keep Sentry for staging/production (and when SENTRY_ENABLED=true).
const enableSentry =
  process.env.SENTRY_ENABLED === "true" ||
  process.env.NEXT_PUBLIC_APP_ENV === "production" ||
  process.env.NEXT_PUBLIC_APP_ENV === "staging" ||
  process.env.VERCEL === "1";

const sentryBuildOptions = {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "ipx-enterprises",

  project: "frontend-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
};

export default enableSentry
  ? withSentryConfig(nextConfig, sentryBuildOptions)
  : nextConfig;
