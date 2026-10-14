# Reg AI Frontend

Next.js 15 frontend for the Reg AI Policy Change Agent V1 SaaS plan.

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style local components
- Clerk authentication and organization switching
- PostHog analytics
- Sentry frontend error reporting
- Docker standalone build support
- Vercel-ready SaaS deployment with future dedicated/on-premise portability

## Local development

Use **Node 22 LTS** (or Node 20.19+ / 24+). Node 23 is unsupported by several dependencies and triggers `EBADENGINE` warnings.

```bash
# if you use nvm:
nvm install 22
nvm use

# or Homebrew:
brew install node@22
brew unlink node && brew link --overwrite --force node@22
```

```bash
$ cd reg-ai-frontend
pyenv install 3.12.11
pyenv global 3.12.11
pyenv local 3.12.11
rm -rf .venv

python -m venv .venv
source .venv/bin/activate
npm install
cp deploy/.vercel.env.local .env
npm run dev
```
### Local url: `http://localhost:3000`

## Useful checks

Run the following checks to ensure heathly status:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Clerk roles

Configure Clerk user metadata or JWT template claims with one of these role labels:

Internal roles:

- `Master User`
- `Developer User`
- `Product Manager`
- `Admin User`

Customer roles:

- `Chief Compliance Officer`
- `Nominated Team Member`

The frontend requests `NEXT_PUBLIC_CLERK_JWT_TEMPLATE` tokens for the FastAPI backend. The backend expects the active Clerk org ID in `org_id`.

Route protection: authenticated pages live under `app/(app)/` and use `SignedInGate` (Clerk `Show` / `RedirectToSignIn`) instead of deprecated `createRouteMatcher` middleware checks. `middleware.ts` still runs bare `clerkMiddleware()` on Vercel/staging/production for session handling (locally off unless `CLERK_MIDDLEWARE_ENABLED=true`). Public routes remain `/`, `/sign-in`, and `/sign-up`.

If you see Clerk “infinite redirect loop”, the publishable and secret keys are usually from different Clerk instances — copy both from the same Dashboard application, restart `next dev`, and clear cookies for `localhost`.

SSO: use Clerk Dashboard social connections (Google/Microsoft) for internal testing, and Clerk Enterprise SSO/SAML for corporate IdP. See `../reg-ai-backend/docs/security-hardening.md`.

## Security headers

`next.config.ts` sets baseline browser security headers (`X-Frame-Options`, `Referrer-Policy`, `nosniff`, HSTS on staging/production). API-side headers and rate limits are documented in the backend security guide.

## Plan readiness

The repo is aligned to `reg-ai-v1-plan-Saas.html`: V1 SaaS on Vercel, Clerk organizations, Supabase storage/vector data, FastAPI on Railway, regulatory and business-change trigger paths, human CCO review, and observability via Sentry/PostHog.

## CLI Vercel Deployment

**First, Install the plugnins:**

```bash
npx plugins add vercel/vercel-plugin
npm i -g vercel
vercel login
vercel
vercel --prod
```

**vercel_url: https://reg-ai-frontend.vercel.app/**

Use separate Vercel preview and production environments. For a standing staging host, follow `../reg-ai-backend/docs/staging-environment.md` (separate Clerk app, `NEXT_PUBLIC_APP_ENV=staging`, Deployment Protection).

Required variables:

```bash
- `NEXT_PUBLIC_API_BASE_URL` — Railway backend URL (see reg-ai-backend/docs/railway-deployment.md)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_JWT_TEMPLATE`
```

Copy from `.env.production.example` for production values.

## Docker

```bash
docker build -t reg-ai-frontend:local .
docker run --rm -p 3000:3000 --env-file .env.frontend reg-ai-frontend:local
```

## Notes

Backend calls go through `NEXT_PUBLIC_API_BASE_URL`, which defaults to `https://reg-ai-backend-dev.up.railway.app`.
