const LINKEDIN_PATH =
  "M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0Z";
const X_PATH =
  "M14.7 10.2 22.4 1h-1.8l-6.7 8-5.3-8H1.4l8.1 12.1L1.4 23h1.8l7.1-8.5 5.7 8.5h7.2L14.7 10.2Zm-2.5 3-.8-1.2L4.2 2.3h2.8l5.2 7.7.8 1.2 6.9 10.2h-2.8l-5.9-8.2Z";
const FACEBOOK_PATH =
  "M22.68 0H1.32C.59 0 0 .6 0 1.33v21.34C0 23.4.59 24 1.32 24h11.5v-9.29H9.69v-3.62h3.13V8.41c0-3.1 1.89-4.79 4.66-4.79 1.33 0 2.47.1 2.8.14v3.24h-1.92c-1.5 0-1.8.72-1.8 1.76v2.31h3.59l-.47 3.62h-3.12V24h6.12c.73 0 1.32-.6 1.32-1.33V1.33C24 .6 23.41 0 22.68 0Z";

export function BrandIcon({ path, className = "h-3.5 w-3.5" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d={path} />
    </svg>
  );
}

export function LinkedInBrandIcon({ className }: { className?: string }) {
  return <BrandIcon path={LINKEDIN_PATH} className={className} />;
}

export function XBrandIcon({ className }: { className?: string }) {
  return <BrandIcon path={X_PATH} className={className} />;
}

export function FacebookBrandIcon({ className }: { className?: string }) {
  return <BrandIcon path={FACEBOOK_PATH} className={className} />;
}
