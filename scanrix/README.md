# Scanrix

URL-based Vulnerability Scanning SaaS – MVP implementation based on `overview.md`.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js)                                              │
│  Auth · Scan creation · Domain verification · Report dashboard   │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ HTTP
┌─────────────────────────────────▼───────────────────────────────┐
│  API (NestJS)                                                    │
│  POST /scans  GET /scans/:id  POST /domains  POST /domains/verify│
│  SSRF guard · Plan enforcement · Auth (Supabase JWT)             │
└──────────┬────────────────────────┬────────────────────────────┘
           │ BullMQ                 │ pg
┌──────────▼──────────┐   ┌────────▼────────────────────────────┐
│  Redis (queue)      │   │  PostgreSQL (Supabase-managed)       │
└──────────┬──────────┘   │  orgs · domains · scans · findings  │
           │              │  scan_artifacts · reports · audit_log│
┌──────────▼──────────┐   └────────────────────────────────────┘
│  Worker             │
│  ┌───────────────┐  │   ┌────────────────────────────────────┐
│  │ httpx         │◄─┼───│  Object Storage (S3/MinIO)         │
│  │ nuclei        │  │   │  Scan artifacts · HTML/JSON reports │
│  │ ZAP           │  │   └────────────────────────────────────┘
│  │ nikto (deep)  │  │
│  │ testssl (deep)│  │
│  └───────────────┘  │
│  Normalizer → DB    │
└─────────────────────┘
```

## Quick Start (Local)

```bash
# 1. Clone and enter the project
cd scanrix

# 2. Copy env vars
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

# 3. Start all services
docker compose up -d

# 4. Open dashboard
open http://localhost:3000
```

Services:
| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:3000      |
| API      | http://localhost:4000      |
| API Docs | http://localhost:4000/docs |
| MinIO    | http://localhost:9001      |
| Traefik  | http://localhost:8080      |

## Project Structure

```
scanrix/
├── packages/
│   ├── api/                    # NestJS backend
│   │   └── src/
│   │       ├── auth/           # Supabase JWT guard
│   │       ├── scans/          # Scan CRUD + queue enqueue
│   │       ├── domains/        # Domain verification (DNS/HTTP/HTML)
│   │       ├── plans/          # Plan limit enforcement
│   │       ├── findings/       # Findings API (plan-gated)
│   │       ├── reports/        # Report retrieval
│   │       ├── storage/        # S3/MinIO adapter
│   │       └── common/         # DB pool, SSRF guard
│   ├── worker/                 # Scanner orchestration worker
│   │   └── src/
│   │       ├── runner/         # DockerRunner + Orchestrator
│   │       ├── scanners/       # httpx, nuclei, ZAP, nikto, testssl
│   │       ├── normalizer/     # Findings normalization + report gen
│   │       └── storage/        # S3 adapter (copied for independence)
│   └── web/                    # Next.js frontend
│       └── src/app/
│           ├── login/          # Auth page
│           └── dashboard/
│               ├── scans/      # Scan list + scan detail
│               └── domains/    # Domain management + verification
└── infra/
    └── db/
        └── migrations/         # PostgreSQL schema (001_initial_schema.sql)
```

## Scan Profiles

| Profile  | Duration     | Scanners                        | Plan      |
|----------|--------------|---------------------------------|-----------|
| QUICK    | 1–3 min      | httpx + nuclei (exposures)      | Free+     |
| STANDARD | 5–15 min     | + ZAP spider + passive + active | Starter+  |
| DEEP     | 15–45 min    | + nikto + testssl               | Pro+      |

## Domain Verification

All domains must be verified before scanning (safe-by-default):

1. **DNS TXT** – Add `scanrix-verification=<token>` TXT record
2. **HTTP file** – Host token at `/.well-known/scanrix-verification.txt`
3. **HTML meta** – Add `<meta name="scanrix-verification" content="<token>">` to homepage

## Security Controls

- **SSRF protection**: Blocks all RFC-1918 / link-local ranges + resolves DNS
- **Domain ownership**: All scans require verified domain
- **Docker limits**: `--cap-drop=ALL`, `--cpus`, `--memory`, `--pids-limit`, per-job network isolation
- **Plan enforcement**: Per-org monthly scan limits + profile gating
- **Row-Level Security**: Supabase RLS policies on all tables
- **Plan-gated findings**: Free plan hides URL paths, evidence, and remediation

## MVP Build Order (overview.md §13)

- [x] DB schema + Supabase Auth integration
- [x] `/scans` API + queue + worker skeleton
- [x] Docker runner for httpx → nuclei → ZAP
- [x] Normalization + report renderer
- [x] Dashboard scans list + scan detail report
- [x] Free plan gating (hide evidence/details)
- [x] Domain verification (HTTP file + DNS TXT + HTML meta)
- [ ] Stripe subscriptions + usage limits *(next)*
- [ ] PostHog instrumentation *(next)*
