# Scanrix Implementation Tracker

> Audited against `overview.md` on 2026-03-02.
> Legend: ✅ Done · ⚠️ Partial · ❌ Missing · 🅿️ Parked (by design)

---

## Section 1 — Goals

| Goal | Status | Notes |
|------|--------|-------|
| Accept scan requests (self-serve SaaS) | ✅ | `POST /scans` |
| Verify user is authorized to scan the target | ✅ | Domain verification (DNS/HTTP/meta) |
| Apply plan limits (free/paid, throttles) | ✅ | `PlansService`, `ThrottlerModule` |
| Run multiple scanners in Docker safely | ✅ | `DockerRunner` + 5 scanner adapters |
| Normalize findings into consistent schema | ✅ | `NormalizerService` |
| Store artifacts + findings + reports | ✅ | S3/MinIO + PostgreSQL |
| Render report + make available in dashboard | ⚠️ | HTML/JSON reports generated & stored; **no signed-URL download endpoint yet** |
| Vendor-neutral object storage | ✅ | `StorageAdapter` interface + S3Adapter |

---

## Section 2 — Architecture

| Component | Status | File(s) |
|-----------|--------|---------|
| Frontend (Next.js 14) | ✅ | `packages/web/` |
| Backend API (NestJS + Fastify) | ✅ | `packages/api/` |
| Auth (Supabase) | ✅ | `auth.guard.ts`, `middleware.ts`, `/auth/callback` |
| Queue (Redis + Bull v4) | ✅ | `worker/src/index.ts` |
| Worker / scanner orchestrator | ✅ | `runner/orchestrator.ts`, `docker-runner.ts` |
| Database (PostgreSQL) | ✅ | `infra/db/migrations/001_initial_schema.sql` |
| Object Storage (S3-compatible) | ✅ | `storage/s3.adapter.ts` |
| Analytics (PostHog) | ✅ | `common/analytics.service.ts`, `app/providers.tsx` |
| Billing / paywall (Stripe) | ✅ | `billing/billing.service.ts` |
| **Scanner: httpx** | ✅ | `scanners/httpx.ts` |
| **Scanner: Nuclei** | ✅ | `scanners/nuclei.ts` |
| **Scanner: OWASP ZAP** | ✅ | `scanners/zap.ts` |
| **Scanner: Nikto** | ✅ | `scanners/nikto.ts` |
| **Scanner: testssl.sh** | ✅ | `scanners/testssl.ts` |
| **Scanner: WhatWeb/Wappalyzer** | 🅿️ | Not yet — parked per overview.md |
| **Scanner: WPScan** | 🅿️ | Not yet — parked, conditional on WP detection |

---

## Section 3 — Request Flow

### Step 0 — Sign Up
| Item | Status | Notes |
|------|--------|-------|
| Supabase Auth (email/magic link) | ✅ | `login/page.tsx` |
| Store user_id + org_id + plan in DB | ✅ | `user_profiles` table, `orgs` table |
| Auth callback (OAuth/magic-link) | ✅ | `/auth/callback/route.ts` |

### Step 1 — Submit Scan
| Item | Status | Notes |
|------|--------|-------|
| URL input validation | ✅ | `@IsUrl()` DTO, `ssrf-guard.ts` |
| SSRF protection (private IPs blocked) | ✅ | `ssrf-guard.ts` — 12 unit tests |
| DNS resolve + validate public IP | ✅ | `ssrf-guard.ts` |
| Domain ownership verification check | ✅ | `assertDomainVerified()` |
| Plan limit check | ✅ | `PlansService.assertCanScan()` |
| Create scan job in DB (QUEUED) | ✅ | `scans.service.ts` |
| Enqueue job into Redis | ✅ | Bull queue in `scans.service.ts` |
| **Per-endpoint rate limit for scan creation** | ❌ | Global 200/min applied; scan creation should override to ~10/min via `@Throttle()` |

### Step 2 — Worker
| Item | Status | Notes |
|------|--------|-------|
| Mark status RUNNING | ✅ | `orchestrator.ts` |
| Create job sandbox directory | ✅ | `fs.mkdtemp()` in orchestrator |
| Create per-job Docker network | ✅ | `docker.createNetwork()` |
| Run scanner containers with limits | ✅ | `DockerRunner` with `--cpus`, `--memory`, `--pids-limit`, `--cap-drop=ALL` |
| Upload artifacts to object storage | ✅ | `uploadArtifact()` in orchestrator |
| Normalize results → DB findings | ✅ | `NormalizerService.ingest()` |
| **Findings deduplication** | ❌ | No dedup by `(category, target_url, cve/cwe, title)` — overview.md Section 8 requirement |
| Generate HTML + JSON report | ✅ | `ReportGenerator.generate()` |
| Update scan status COMPLETED/FAILED | ✅ | `orchestrator.ts` |

### Step 3 — Dashboard
| Item | Status | Notes |
|------|--------|-------|
| Scans list | ✅ | `/dashboard/scans/page.tsx` with auto-poll |
| Scan detail page | ✅ | `/dashboard/scans/[id]/page.tsx` |
| Report summary + severity counts | ✅ | Shown on scan detail |
| Findings table | ✅ | Grouped by severity, masked for free plan |
| **Evidence / recommendation expansion** | ❌ | Paid users get evidence/recommendation from API but UI never displays them — no expandable row or detail panel |
| **Artifact download (raw files)** | ❌ | No `GET /scans/:id/artifacts` endpoint or signed URL generation |
| **Report download button** | ❌ | HTML/JSON report keys returned by API but no download UI or presigned URL endpoint |

---

## Section 4 — Domain Verification

| Item | Status | Notes |
|------|--------|-------|
| DNS TXT verification | ✅ | `checkDnsTxt()` |
| HTTP file verification | ✅ | `checkHttpFile()` |
| HTML meta tag verification | ✅ | `checkHtmlMeta()` |
| Verification state machine (UNVERIFIED/PENDING/VERIFIED/FAILED/EXPIRED) | ✅ | DB enum + service |
| "Check Verification" button in UI | ✅ | `domains/page.tsx` |
| Auto re-check PENDING domains (cron) | ✅ | `DomainsCron` — every 30 min |
| Auto-expire VERIFIED domains (cron) | ✅ | `DomainsCron` — daily at 2AM |
| Verification instructions in UI (all 3 methods) | ✅ | Expandable panel in domains page |

---

## Section 5 — Plans & Paywall

| Item | Status | Notes |
|------|--------|-------|
| Free plan (1 scan, QUICK only) | ✅ | `PlansService` |
| Paid plans (more scans, all profiles) | ✅ | `PlansService` limits per plan |
| Hide findings details for free users | ✅ | `FindingsService` masks path/evidence/recommendation |
| Show "upgrade to reveal" in UI | ✅ | Banner + `PlanGate` component |
| Upgrade page (pricing tiers) | ✅ | `/dashboard/upgrade/page.tsx` |
| Stripe checkout flow | ✅ | `BillingService.createCheckoutSession()` |
| Stripe webhook processing | ✅ | With idempotency via `subscription_events` |
| Plan update on subscription events | ✅ | Updates `orgs.plan`, `scans_limit` |
| **Downloadable artifacts (paid plan)** | ❌ | Backend stores artifacts in S3 but no signed URL endpoint to serve them |
| **Scheduled scans (nice-to-have)** | 🅿️ | Not implemented — parked |

---

## Section 6 — Scan Profiles

| Profile | Tools | Status | Notes |
|---------|-------|--------|-------|
| QUICK | httpx + nuclei | ✅ | Implemented in orchestrator |
| STANDARD | httpx + nuclei + ZAP (spider + passive + selective active) | ✅ | Implemented |
| DEEP | httpx + nuclei + ZAP + nikto + testssl | ✅ | Implemented |
| ENTERPRISE | Authenticated scanning, OpenVAS, API spec | 🅿️ | Parked per overview.md |
| Profile gating in UI (free → QUICK only) | ✅ | Disabled profile selector in scans page |

---

## Section 7 — Worker Safety

| Control | Status | Notes |
|---------|--------|-------|
| SSRF protection (private CIDRs blocked) | ✅ | `ssrf-guard.ts` |
| Docker `--cpus`, `--memory`, `--pids-limit` | ✅ | `DockerRunner` |
| `--read-only` filesystem | ✅ | `DockerRunner` |
| `--cap-drop=ALL` | ✅ | `DockerRunner` |
| No privileged containers | ✅ | `DockerRunner` |
| Per-job Docker network isolation | ✅ | `orchestrator.ts` |
| Job timeouts per scanner | ✅ | Timeout flags passed to each scanner |
| Concurrency caps by plan | ✅ | `WORKER_CONCURRENCY` env + plan check |
| **Per-user/per-target rate limiting** | ⚠️ | Global throttler exists (200/min); scan creation needs stricter per-endpoint limit |

---

## Section 8 — Normalization Layer

| Item | Status | Notes |
|------|--------|-------|
| Unified finding schema | ✅ | `findings` table in DB |
| httpx normalizer | ✅ | `normalizer.service.ts` |
| nuclei normalizer | ✅ | `normalizer.service.ts` |
| ZAP normalizer | ✅ | `normalizer.service.ts` |
| nikto normalizer | ✅ | `normalizer.service.ts` |
| testssl normalizer | ✅ | `normalizer.service.ts` |
| **Findings deduplication** | ❌ | Missing: group by `(category, target_url, cve/cwe, title)`, prefer higher confidence, merge evidence arrays |

---

## Section 9 — Storage Layer

| Item | Status | Notes |
|------|--------|-------|
| `StorageAdapter` interface | ✅ | `putObject`, `getSignedUrl`, `list`, `delete` |
| AWS S3 backend | ✅ | `S3StorageAdapter` |
| MinIO backend (dev) | ✅ | Same adapter, different endpoint |
| GCP / Azure backends | 🅿️ | Parked — S3-first per overview.md |
| MinIO provisioning in Docker Compose | ✅ | `minio-init` service |
| **Signed URL serving for downloads** | ❌ | `getSignedUrl()` exists on adapter but no API endpoint exposes it to clients |

---

## Section 10 — Platform Containers

| Container | Status | Notes |
|-----------|--------|-------|
| PostgreSQL | ✅ | `docker-compose.yml` |
| Redis | ✅ | `docker-compose.yml` |
| MinIO (local/dev) | ✅ | `docker-compose.yml` |
| API | ✅ | `docker-compose.yml` |
| Worker | ✅ | `docker-compose.yml` |
| Frontend | ✅ | `docker-compose.yml` |
| Traefik (reverse proxy) | ✅ | `docker-compose.yml` |
| PostHog (self-hosted) | 🅿️ | Using PostHog Cloud — self-hosted optional |
| Prometheus + Grafana | 🅿️ | Parked per overview.md |

---

## Section 11 — Admin & Ops

| Item | Status | Notes |
|------|--------|-------|
| Admin: view scans | ✅ | `GET /admin/scans` |
| Admin: block abusive users | ✅ | `POST /admin/users/:id/block` |
| Admin: manage allow/deny lists | ⚠️ | Block/unblock exists; domain allow/deny list not implemented |
| Admin: view job failures | ✅ | `GET /admin/scans?status=FAILED` |
| Admin: platform stats | ✅ | `GET /admin/stats` |
| Audit log | ✅ | `AuditService` + `audit_log` table |
| Rate limiting (strict) | ✅ | Global 200/min via `@nestjs/throttler` |
| Domain verification requirement | ✅ | `assertDomainVerified()` called before scan |

---

## Definition of Done (MVP) — from overview.md

| Criterion | Status | Notes |
|-----------|--------|-------|
| User can sign up (Supabase) | ✅ | |
| User can verify domain (HTTP or DNS) | ✅ | All 3 methods |
| User can run a Quick scan (free) and see partial report | ✅ | Plan gating works |
| Paid user can run Standard/Deep scan and see full report | ⚠️ | API returns full data; **UI doesn't render evidence/recommendation/download** |
| Scans run in Docker with strict limits | ✅ | |
| Findings normalized and visible in dashboard | ✅ | |
| Artifacts stored in vendor-neutral object storage | ✅ | S3/MinIO |
| PostHog tracks key funnel events | ✅ | scan.created + browser events |

---

## Remaining Work — Priority Order

### 🔴 High (blocks MVP completeness)

| # | Task | File(s) to create/modify | Overview.md ref |
|---|------|--------------------------|-----------------|
| 1 | **Findings dedup**: add `ON CONFLICT (scan_id, category, target_url, COALESCE(cve,''), COALESCE(cwe,''), title) DO UPDATE` in normalizer to merge evidence and prefer higher confidence | `worker/src/normalizer/normalizer.service.ts`, `infra/db/migrations/003_findings_dedup.sql` | §8 Dedup rules |
| 2 | **Artifact download API**: add `GET /scans/:id/artifacts` (list) and `GET /scans/:id/artifacts/:tool/download` (returns presigned URL) | `api/src/scans/scans.controller.ts`, `api/src/scans/scans.service.ts` | §3 Step 3 dashboard |
| 3 | **Report download endpoint**: add `GET /scans/:id/report/html` and `/json` that return presigned S3 URLs | `api/src/reports/reports.service.ts`, `api/src/reports/reports.controller.ts` | §3 Step 3 dashboard |
| 4 | **Finding detail UI**: expandable row in scan detail page showing evidence, recommendation, request/response (paid only) | `web/src/app/dashboard/scans/[id]/page.tsx` | §3 Step 3, §5 paid plan |
| 5 | **Download buttons in UI**: add "Download HTML Report" / "Download JSON" links on scan detail page (paid only, uses signed URL) | `web/src/app/dashboard/scans/[id]/page.tsx`, `web/src/lib/api.ts` | §5 Downloadable artifacts |

### 🟡 Medium (polish / correctness)

| # | Task | File(s) | Overview.md ref |
|---|------|---------|-----------------|
| 6 | **Stricter scan creation rate limit**: add `@Throttle({ default: { limit: 10, ttl: 60000 } })` on `ScansController.create()` | `api/src/scans/scans.controller.ts` | §7 per-user rate limiting |
| 7 | **Swagger/OpenAPI setup**: add `SwaggerModule.setup('api/docs', app, doc)` in `main.ts` — controllers already have `@ApiTags` decorators | `api/src/main.ts` | General API quality |
| 8 | **`.env.example` completeness**: add `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `POSTHOG_API_KEY`, `POSTHOG_HOST` | `scanrix/.env.example` | — |
| 9 | **Domain allow/deny list for admin**: add `POST /admin/domains/block` endpoint | `api/src/admin/admin.controller.ts`, `api/src/admin/admin.service.ts` | §11 Admin |
| 10 | **Missing test for `BillingService`**: unit test checkout + webhook idempotency | `api/src/billing/billing.service.spec.ts` | Testing requirement |
| 11 | **Missing test for `AuthGuard`**: unit test JWT validation + role extraction | `api/src/auth/auth.guard.spec.ts` | Testing requirement |

### 🟢 Low / Parked (post-MVP)

| # | Task | Priority |
|---|------|----------|
| P1 | Scheduled scans (cron + notification) | Post-MVP paid feature |
| P2 | Webhook integrations (Slack/email on scan completion) | Post-MVP |
| P3 | WhatWeb/Wappalyzer CLI scanner | Nice-to-have |
| P4 | WPScan (conditional on WP detection) | Nice-to-have |
| P5 | Authenticated scanning (cookie/session vault) | Post-MVP |
| P6 | OpenAPI/Swagger-based API scanning | Post-MVP |
| P7 | Kubernetes jobs runner | Scale-up |
| P8 | Observability (Prometheus + Grafana) | Scale-up |
| P9 | GCP / Azure native storage adapters | Scale-up |
| P10 | Team/org accounts + RBAC roles | Post-MVP |
| P11 | Scan replay & diff reports | Post-MVP |
| P12 | Greenbone/OpenVAS (infra/network scanning) | Post-MVP |
| P13 | Per-tenant encryption keys | Post-MVP |
| P14 | Production Kubernetes deployment config | Post-MVP |

---

## File Coverage Map

```
scanrix/
├── infra/db/migrations/
│   ├── 001_initial_schema.sql     ✅
│   └── 002_stripe.sql             ✅
│   └── 003_findings_dedup.sql     ❌ needed
├── packages/api/src/
│   ├── admin/                     ✅
│   ├── auth/                      ✅
│   ├── billing/                   ✅
│   │   └── billing.service.spec   ❌ missing test
│   ├── common/                    ✅
│   ├── db/migrate.ts              ✅
│   ├── domains/                   ✅
│   ├── findings/                  ✅
│   ├── plans/                     ✅
│   ├── reports/                   ⚠️ missing signed URL endpoints
│   └── scans/                     ⚠️ missing artifact download endpoint, throttle override
├── packages/worker/src/
│   ├── normalizer/                ⚠️ missing dedup logic
│   ├── runner/                    ✅
│   ├── scanners/                  ✅ (httpx, nuclei, zap, nikto, testssl)
│   └── storage/                   ✅
├── packages/web/src/
│   ├── app/auth/                  ✅
│   ├── app/dashboard/
│   │   ├── domains/               ✅
│   │   ├── scans/page.tsx         ✅
│   │   ├── scans/[id]/page.tsx    ⚠️ missing evidence expansion, download buttons
│   │   └── upgrade/               ✅
│   ├── components/                ✅
│   └── middleware.ts              ✅
├── e2e/                           ✅
└── docker-compose.yml             ✅
```

---

*Last updated: 2026-03-02*
