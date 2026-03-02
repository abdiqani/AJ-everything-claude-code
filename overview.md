# Orchestration Layer â€“ Complete Plan (Docker-first)

This document defines the **end-to-end orchestration layer** for your URL-based vulnerability scanning SaaS (MVP â†’ scalable platform). It includes **must-have**, **nice-to-have**, and **parked** items, plus coverage levels and operational guardrails.

---

## 1) Goals

- Accept scan requests (self-serve SaaS)
- Verify user is authorized to scan the target
- Apply plan limits (free/paid, throttles)
- Run **multiple open-source scanners in Docker** safely
- Normalize findings into a consistent schema
- Store artifacts + findings + reports
- Render a report and make it available in the client dashboard
- Keep components vendor-neutral (esp. object storage)

---

## 2) High-level Architecture

### Core services
- **Frontend (Dashboard)**: Next.js / React
- **Backend API**: Node.js (NestJS) *or* FastAPI (either is fine; pick one for speed)
- **Auth**: Supabase Auth
- **Queue**: Redis + BullMQ (Node) *or* Redis + Celery (Python)
- **Workers**: Scanner Orchestrator Workers (runs Docker jobs)
- **Database**: PostgreSQL (Supabase Postgres is fine)
- **Object Storage**: S3-compatible abstraction (AWS S3 / GCP / Azure / MinIO)
- **Analytics**: PostHog
- **Billing/Paywall**: Stripe (recommended). Superwall is more mobile-first; use Stripe for web SaaS.

### Scanning tool containers (run per job)
**Must-have scanners**
- **httpx** (ProjectDiscovery) â€“ target normalization, alive checks, tech hints
- **Nuclei** â€“ fast template-based findings (CVEs/exposures/misconfigs)
- **OWASP ZAP** â€“ DAST spider + passive + selective active rules

**Nice-to-have scanners**
- **Nikto** â€“ legacy/common server checks
- **testssl.sh** â€“ TLS posture checks
- **WhatWeb/Wappalyzer CLI** â€“ tech fingerprinting (helps route scans)
- **WPScan** (conditional) â€“ WordPress-specific scan when WP detected

**Parked (later)**
- **Authenticated scanning** (login flows, session handling, OAuth)
- **OpenAPI/Swagger-based API scanning** (import spec)
- **Greenbone/OpenVAS** (infra/network scanning; heavier)
- **SCA** (dependency scanning) â€“ only if you accept repo/SBOM, not URL-only
- **Retesting/verification pipeline** (validate fixes automatically)

---

## 3) Request Flow (End-to-End)

### Step 0 â€” User signs up
- Supabase Auth (email/password, magic link, OAuth optional)
- Store `user_id`, `org_id`, and plan state in DB

### Step 1 â€” User submits scan
Backend endpoint:
- `POST /scans` with `{ target_url, scan_profile }`

Backend performs:
1) **Input validation**
   - Normalize URL (scheme, punycode, remove fragments)
   - Block private IP ranges and local hosts (SSRF protection)
   - Resolve DNS and validate IP is public
2) **Authorization / Ownership verification** (details below)
3) **Plan checks**
   - Free vs paid limits
   - Rate limits / concurrency caps
4) **Create scan job** in DB (status: QUEUED)
5) **Enqueue job** into queue (Redis)

### Step 2 â€” Worker picks job
Worker performs:
1) Mark status RUNNING
2) Create **job sandbox** directory or per-job object storage prefix
3) Create per-job Docker network (optional but recommended)
4) Run scanner containers with strict limits (CPU/mem/timeouts)
5) Upload artifacts to object storage
6) Normalize results â†’ DB findings
7) Generate report (HTML/JSON) and store
8) Update scan status COMPLETED (or FAILED)

### Step 3 â€” Dashboard
- Lists scans
- Shows scan detail page
- Shows report summary + findings
- Allows downloading raw artifacts (if plan allows)

---

## 4) Ownership/Permission Verification (Safe-by-default)

### Policy (updated)
âœ… **Only VERIFIED domains can be scanned** (any scan profile). If a domain is not verified, the platform **must not** enqueue or run any scanners.

This is the strictest and safest approach for a URL-based scanning SaaS and reduces abuse risk.

### Why â€œemail domain can only scan same email domainâ€ is not safe enough
- Email domain â‰  proof of control of the target domain
- Many users have consumer email providers (gmail/outlook) but own domains
- Agencies scan client domains (different email domains)

### Verification methods (supported)

**A) DNS TXT verification (recommended standard)**
- User adds TXT record: `scanrix-verification=<token>`
- Backend checks DNS for token
- Pros: robust, widely used
- Cons: propagation delay

**B) HTTP file verification (fast alternative)**
- User hosts file at: `https://target/.well-known/scanrix-verification.txt`
- File contents = token
- Pros: fast, no DNS waiting
- Cons: requires access to web server/CMS

**C) HTML meta tag verification (optional)**
- Add `<meta name="scanrix-verification" content="token">` to homepage
- Useful for some site builders; treat caching carefully.

### Verification states
- `UNVERIFIED` â†’ cannot scan
- `PENDING` â†’ cannot scan
- `VERIFIED` â†’ can scan
- `EXPIRED` â†’ cannot scan (re-verify)
- `FAILED` â†’ cannot scan

### Practical UX
- When user enters a target URL, backend checks `(org_id, root_domain)`:
  - If `VERIFIED`: allow scan request to proceed
  - Else: return `403 Verification required` + verification instructions

### DNS propagation handling
- verification status starts as `PENDING`
- allow â€œCheck verificationâ€ button
- also re-check automatically every X minutes for Y hours

---

## 5) Plans & Paywall (Free + Paid)

### Free plan (lead magnet)
- 1 scan total (or 1/month)
- **Quick Scan only**
- Show summary + severity counts
- **Hide details**:
  - hide exact vulnerable URL paths
  - hide full evidence/requests
  - hide remediation steps
  - show â€œupgrade to revealâ€

### Paid plans
- More scans/month + concurrency
- Deep scans enabled
- Full findings details + evidence
- Downloadable artifacts
- Scheduled scans (nice-to-have)

### Billing implementation
- **Stripe** for web SaaS subscriptions + metered usage
- Keep Superwall as parked (more common for mobile paywalls)

---

## 6) Coverage Levels (Productized Scan Profiles)

### Profile 1: QUICK (1â€“3 minutes)
**Goal:** fast, safe, low resource
- httpx (alive + basic tech)
- nuclei (top templates / exposure-focused)
- headers/TLS quick checks (optional)
- No aggressive crawling, no heavy active attacks

### Profile 2: STANDARD (5â€“15 minutes)
**Goal:** meaningful web coverage
- httpx
- nuclei (broader set)
- ZAP:
  - spider
  - passive scan
  - selective active rules (low-risk)

### Profile 3: DEEP (15â€“45 minutes)
**Goal:** deeper coverage, higher runtime
- httpx
- nuclei (full relevant templates)
- ZAP:
  - deeper crawl
  - authenticated mode (parked)
  - more active rules
- nikto, testssl

### Profile 4: ENTERPRISE (parked)
- Authenticated scanning
- API spec scanning
- OpenVAS (network)
- Retesting automation

---

## 7) Worker Orchestration Details (Docker-clean)

### Hard safety controls (must-have)
- **SSRF protection**: block private CIDRs, localhost, link-local
- **Egress allowlisting** (optional advanced): only target host/IP
- Docker container limits:
  - `--cpus`, `--memory`, `--pids-limit`
  - `--read-only` filesystem where possible
  - drop capabilities `--cap-drop=ALL`
  - no privileged containers
- Job timeouts per scanner
- Concurrency caps by plan
- Per-user and per-target rate limiting

### Recommended execution sequence
1) **Preflight**: resolve DNS, httpx probe, build target set
2) **Nuclei**: fast signatures first
3) **ZAP**: DAST crawl + passive + controlled active
4) **Optional**: nikto/testssl/wp

### Outputs
- raw artifacts per tool:
  - `httpx.jsonl`
  - `nuclei.jsonl`
  - `zap.json` + `zap.html`
  - optional tool logs
- normalized `findings` inserted into DB
- generated report (HTML + JSON)

---

## 8) Normalization Layer (Findings Schema)

Create a single normalized model so the UI and AI layer are consistent.

**Finding fields (minimum):**
- `finding_id`
- `scan_id`
- `tool` (zap/nuclei/nikto/testssl)
- `title`
- `severity` (info/low/medium/high/critical)
- `confidence` (low/med/high)
- `category` (xss/sqli/misconfig/auth/tls/cve/etc.)
- `target_url`
- `evidence` (sanitized)
- `request` / `response` (optional; gated by plan)
- `cwe` / `cve` (optional)
- `recommendation`
- `references` (links)
- `created_at`

**Dedup rules:**
- group by `(category, target_url, cve/cwe, title)`
- prefer higher confidence
- merge evidence arrays

---

## 9) Storage Layer (Vendor-neutral Object Storage)

### Requirement: configurable to different vendors
Implement an internal `StorageAdapter` interface:
- `putObject(key, bytes, contentType)`
- `getSignedUrl(key, ttl)`
- `list(prefix)`
- `delete(prefix)`

Support backends:
- AWS S3
- GCP (S3-compatible gateway or native adapter)
- Azure Blob (native adapter)
- MinIO (S3-compatible for local/dev)

**MVP recommendation:**
- Use **S3-compatible first** (AWS S3 + MinIO)
- Add Azure/GCP native later

---

## 10) Platform Containers (latest stable)

Use **pinned major versions** and regularly update patch versions.

**Must-have**
- Postgres (Supabase-managed or dockerized for local)
- Redis
- MinIO (local/dev)
- API
- Worker
- Frontend
- Reverse proxy (Traefik or Nginx)

**Nice-to-have**
- PostHog (self-hosted) or PostHog Cloud
- Admin UI (internal)
- Observability (Prometheus + Grafana) (parked)

---

## 11) Admin & Ops (Must-have)

- Admin dashboard:
  - view scans
  - block abusive users
  - manage allow/deny lists
  - view job failures
- Audit log:
  - who scanned what, when
- Abuse prevention:
  - strict rate limits
  - scan target verification requirements
  - safe scan defaults

---

## 12) â€œMissing / Parkedâ€ Checklist

### Parked â€“ likely needed as you scale
- Authenticated scanning flows (cookie/session vault)
- Team/org accounts + roles
- Scheduled scans + notifications
- Webhook integrations (Slack/Email)
- Scan replay & diff reports
- SBOM/repo scanning (SCA)
- Kubernetes jobs runner
- Per-tenant encryption keys

---

## 13) MVP Build Order (Practical)

1) DB schema + Supabase Auth integration
2) `/scans` API + queue + worker skeleton
3) Docker runner for httpx â†’ nuclei â†’ zap
4) Normalization + report renderer
5) Dashboard scans list + scan detail report
6) Free plan gating (hide evidence/details)
7) Domain verification (HTTP file first, then DNS TXT)
8) Stripe subscriptions + usage limits
9) PostHog instrumentation

---

## 14) Deliverables (What youâ€™ll implement)

### Backend
- Scan request API
- Verification API
- Plan enforcement
- Queue + worker orchestration
- Storage adapter
- Findings normalization
- Report generation

### Frontend
- Auth
- Scan creation UI
- Verification UI
- Scan list + scan detail
- Paywall + upgrade

### DevOps
- Docker Compose for local
- Production deployment (VM or Kubernetes later)
- Secrets management

---

## 15) Definition of Done (MVP)

- User can sign up (Supabase)
- User can verify domain (HTTP or DNS)
- User can run a Quick scan (free) and see partial report
- Paid user can run Standard/Deep scan and see full report
- Scans run in Docker with strict limits
- Findings are normalized and visible in dashboard
- Artifacts stored in vendor-neutral object storage
- PostHog tracks key funnel events
