# PostHog Self-driving Setup Report

## Summary

PostHog Self-driving has been configured for **reg-ai-frontend**: session replay, error tracking, support, and health-check sources are now armed; GitHub Issues is syncing; 14 additional tool responders are enabled; and the scout troop (general + product-analytics + customer-analytics + a custom review-pipeline scout) will fire within ~30 minutes. Findings will start appearing in your Self-driving inbox at https://us.posthog.com/project/464974/inbox within about 30 minutes.

---

## AI data processing

**Approved.** Organization-level AI data processing consent was verified by the wizard before this run started.

---

## GitHub

**Connected during this run.** GitHub App integration `ipx-ent` (id: 188798) was installed and verified. The GitHub Issues warehouse source for `ipx-ent/reg-ai-frontend` was created (source id: `019f87ee-6190-0000-c116-5ea4e0218fec`); issues sync has started. Note: only the `issues` table is syncing — additional tables (pull requests, releases, etc.) can be enabled in the Data Management UI.

---

## Products enabled

| Product | Status | Notes |
|---|---|---|
| Session Replay | **Follow-up required** | `products-enable` tool not available in this PostHog deploy — enable manually in Project Settings |
| Error Tracking | **Follow-up required** | Same as above |
| Support (Conversations) | **Follow-up required** | Same as above — also requires an inbound channel (email / inbox / Slack) to be connected before tickets arrive |

**posthog.init check:** `components/providers/app-providers.tsx` was inspected. The init has no `disable_session_recording` or `capture_exceptions: false` overrides — the server toggle is sufficient once enabled manually.

---

## Signal sources

| source_product | source_type | Action | Config ID |
|---|---|---|---|
| `signals_scout` | `cross_source_issue` | **On by default** — no row needed | — |
| `health_checks` | `health_issue` | **Enabled** | `019f87e7-8004-725c-9759-60137464ba99` |
| `error_tracking` | `issue_created` | **Enabled** | `019f87e7-890c-7d43-9681-3411fb272eeb` |
| `error_tracking` | `issue_reopened` | **Enabled** | `019f87e7-8b71-7d10-9b03-4de2043ef2cc` |
| `error_tracking` | `issue_spiking` | **Enabled** | `019f87e7-9b60-707b-bde5-926127c7bb19` |
| `session_replay` | `session_analysis_cluster` | **Enabled** (sample_rate: 0.1) | `019f87e7-9f4c-7d58-8ece-b1025649cac7` |
| `conversations` | `ticket` | **Enabled** (dormant until channel connected) | `019f87e7-a196-7a1a-b8fc-b3602a86a1c6` |
| `llm_analytics` | `evaluation` | **Skipped** — internal-only, not a user-facing responder | — |
| `logs` | — | **Skipped** — not a v1 responder | — |

---

## Connected tools

| Tool | Status | Details |
|---|---|---|
| **GitHub Issues** | **Connected by this run** | Warehouse source id `019f87ee-6190-0000-c116-5ea4e0218fec`, repo `ipx-ent/reg-ai-frontend`, issues table syncing. Responder id `019f87ee-9ac7-7d3c-870e-9950d88095ce`. Only the issues table is syncing; additional tables can be added in the UI. |
| **Sentry** | **Responder enabled — warehouse source not connected (dormant)** | You selected Sentry but skipped the connect page. Responder id `019f87ee-9e58-7ea1-bad0-8227d63178f7`. Silent until you add the source. |
| **Jira** | **Responder enabled — warehouse source not connected (dormant)** | Responder id `019f87ee-a2c3-7a0c-b8eb-76038b0e4735`. |
| **GitLab** | **Responder enabled — warehouse source not connected (dormant)** | You said "done" on the connect page but no stored credential was found (may have expired or not been submitted). Responder id `019f87ee-a61e-71ce-9912-82c146711b8b`. |
| **Rollbar** | **Responder enabled — dormant** | Responder id `019f87ee-aae8-727f-ab77-fd07a7d984f4`. |
| **Raygun** | **Responder enabled — dormant** | Responder id `019f87ee-ad23-7368-95a6-42503eff5992`. |
| **Freshservice** | **Responder enabled — dormant** | Responder id `019f87ee-b064-7503-85e1-552f27c9388d`. |
| **Front** | **Responder enabled — dormant** | Responder id `019f87ee-b3d9-7516-a0fe-3ac152789a0b`. |
| **Gorgias** | **Responder enabled — dormant** | Responder id `019f87ee-b631-70ee-9803-a9b7bb834c5e`. |
| **Dixa** | **Responder enabled — dormant** | Responder id `019f87ee-ba3d-7fa2-bb62-a96db9159198`. |
| **SonarQube** | **Responder enabled — dormant** | Responder id `019f87ee-bd78-7d8a-845d-01be5e3a9c56`. |
| **Featurebase** | **Follow-up required** | `source_type: feedback` not supported in this PostHog version — responder row could not be created. |
| **UserVoice** | **Follow-up required** | Same as Featurebase. |
| **Retently** | **Follow-up required** | Same as Featurebase. |
| **Judge.me** | **Follow-up required** | `source_type: review` not supported in this PostHog version — responder row could not be created. |

---

## Scout troop

**4 active, 24 disabled.**

| Scout | Status | Reason |
|---|---|---|
| `general` | **Enabled** | Always on — cross-product correlations and surfaces no specialist covers |
| `product-analytics` | **Enabled** | Primary specialist — custom event captures, pageview tracking, funnel flows |
| `customer-analytics` | **Enabled** | B2B specialist — `posthog.group("organization", orgId)` confirms org-level tracking |
| `review-pipeline` | **Enabled (custom)** | Domain specialist — see Custom scouts section below |
| `error-tracking` | **Disabled** | Intentional — covered by native `error_tracking` signal source |
| `session-replay` | **Disabled** | Intentional — covered by native `session_replay` signal source |
| `ai-observability` | **Disabled** | No `$ai_*` events or LLM SDK in this repo |
| `anomaly-detection` | **Disabled** | Not a top-2 specialist; general scout covers cross-product anomalies |
| `apm` | **Disabled** | No OpenTelemetry spans instrumented |
| `conversations` | **Disabled** | Native conversations source handles support tickets |
| `csp-violations` | **Disabled** | No CSP reporting configured |
| `data-pipelines` | **Disabled** | No CDP destinations or batch exports |
| `data-warehouse` | **Disabled** | Re-enable once warehouse sources begin syncing |
| `experiments` | **Disabled** | No active A/B experiments found |
| `feature-flags` | **Disabled** | No evidence of active flag usage; re-enable if you use flags |
| `health-checks` | **Disabled** | Native `health_checks` source handles this |
| `inbox-validation` | **Disabled** | Fresh setup — no resolved reports to validate yet |
| `ingestion-warnings` | **Disabled** | Not a top-2 specialist |
| `insight-alerts` | **Disabled** | No configured alerts yet |
| `logs` | **Disabled** | PostHog logs product not in use |
| `mcp-tool-calls` | **Disabled** | No `$mcp_tool_call` telemetry |
| `observability-gaps` | **Disabled** | Not a top-2 specialist |
| `replay-vision` | **Disabled** | No Replay Vision scanners configured |
| `revenue-analytics` | **Disabled** | No payment SDK found |
| `skills-store` | **Disabled** | Not a top-2 specialist |
| `surveys` | **Disabled** | No surveys in use |
| `web-analytics` | **Disabled** | Authenticated app, not a marketing site |
| `web-vitals` | **Disabled** | Not a top-2 specialist; re-enable if Core Web Vitals are captured |

---

## Custom scouts

### Created: `signals-scout-review-pipeline`

**Surface:** The regulatory document review pipeline — submission → review queue → approval chain → final decision (approved/rejected).

**Why no built-in scout covers it:** `signals-scout-product-analytics` watches saved PostHog funnel flows, but no funnels exist for this pipeline yet. This scout watches the underlying events directly using the product's own vocabulary (`review-queue-workspace`, `approval-chain-form`).

**Discriminator:** Completion rate from submission to final decision drops >20% vs the prior period while submission volume holds (>80% of prior). A drop in both submissions and completions is a traffic issue, not a pipeline finding.

**Explore patterns:**
1. Step-by-step funnel conversion across review stages (discovers events via `read-data-schema`)
2. Documents stuck past SLA — users with submission events but no decision event in >7 days
3. Approval chain form abandonment — form-start events not followed by a completion
4. Role-based divergence — breaks down completion rate by the `role` person property

**Noise escape hatch:** If this scout turns out noisy, set `emit: false` on its config (`019f8807-e012-752a-85cd-e942313c3712`) in PostHog to switch it to dry-run mode.

**Surfaces considered and ruled out:**
- User/org onboarding funnel — ruled out: `signals-scout-product-analytics` covers saved funnels; surface not independently nameable without confirmed event names
- Role-based access patterns — ruled out: could not name a concrete discriminator without confirmed events; noted as a report consideration for the general scout

---

## Follow-ups

- [ ] **Enable Session Replay, Error Tracking, and Support products** — `products-enable` tool was unavailable in this PostHog version. Go to [Project Settings](https://us.posthog.com/project/464974/settings) and turn on each product manually. The `posthog.init` in `components/providers/app-providers.tsx` is already clean (no overrides), so the server toggle is sufficient.
- [ ] **Connect a Support inbound channel** — Conversations product must have an email, inbox, or Slack channel connected before tickets reach the inbox. Configure in [Conversations Settings](https://us.posthog.com/project/464974/settings).
- [ ] **Connect Sentry warehouse source** — Visit https://us.posthog.com/project/464974/data-warehouse/connect?kind=Sentry and enter credentials. The responder row is already enabled and will start firing automatically once the source syncs.
- [ ] **Connect Jira warehouse source** — https://us.posthog.com/project/464974/data-warehouse/connect?kind=Jira
- [ ] **Connect GitLab warehouse source** — https://us.posthog.com/project/464974/data-warehouse/connect?kind=GitLab (your previous attempt didn't store a credential — try again)
- [ ] **Connect Rollbar warehouse source** — https://us.posthog.com/project/464974/data-warehouse/connect?kind=Rollbar
- [ ] **Connect Raygun warehouse source** — https://us.posthog.com/project/464974/data-warehouse/connect?kind=Raygun
- [ ] **Connect Freshservice warehouse source** — https://us.posthog.com/project/464974/data-warehouse/connect?kind=Freshservice
- [ ] **Connect Front warehouse source** — https://us.posthog.com/project/464974/data-warehouse/connect?kind=Front
- [ ] **Connect Gorgias warehouse source** — https://us.posthog.com/project/464974/data-warehouse/connect?kind=Gorgias
- [ ] **Connect Dixa warehouse source** — https://us.posthog.com/project/464974/data-warehouse/connect?kind=Dixa
- [ ] **Connect SonarQube warehouse source** — https://us.posthog.com/project/464974/data-warehouse/connect?kind=Sonarqube
- [ ] **Featurebase, UserVoice, Retently, Judge.me** — Responder source types (`feedback` / `review`) are not available in this PostHog version. Check back after a PostHog upgrade, or connect them via the new Data Warehouse source page: https://us.posthog.com/project/464974/pipeline/new/source
- [ ] **Instrument review pipeline events** — The `signals-scout-review-pipeline` scout will close out empty until review/submission/approval events are explicitly captured. Add `captureAnalyticsEvent` calls at key review workflow steps (e.g. document submitted, review started, approval chain step completed, decision made) so the scout has data to watch.
- [ ] **Re-enable `signals-scout-data-warehouse`** — Once the connected tool warehouse sources (Sentry, Jira, etc.) begin syncing, enable this scout in PostHog to monitor import health.
- [ ] **Re-enable `signals-scout-feature-flags`** — If you use PostHog feature flags in this project, enable this scout.

---

## What happens next

The scout coordinator picks up fresh configs within ~30 minutes; the four enabled scouts (`general`, `product-analytics`, `customer-analytics`, `review-pipeline`) will fire on their first tick. Native sources (error tracking, session replay, health checks, GitHub Issues) begin routing findings immediately as signals arrive. Immediately-actionable findings will appear in your inbox at https://us.posthog.com/project/464974/inbox and can seed coding tasks directly.
