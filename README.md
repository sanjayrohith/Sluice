# Sluice

**Self-hosted webhook ingestion gateway — capture, verify, deduplicate, deliver, and replay webhooks reliably.**

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICLICENSE) [![Build Status](https://img.shields.io/github/actions/workflow/status/sanjayrohith/webhook_gateway/test.yml?logo=appveyor)](https://github.com/sanjayrohith/webhook_gateway/actions) [![GitHub stars](https://img.shields.io/github/stars/sanjayrohith/webhook_gateway?style=social)](https://github.com/sanjayrohith/webhook_gateway/stargazers) [![GitHub top language](https://img.shields.io/github/top/lang/sanjayrohith/webhook_gateway?color=blue)](https://github.com/sanjayrohith/webhook_gateway) [![GitHub last commit](https://img.shields.io/github/last-commit/sanjayrohith/webhook_gateway)](https://github.com/sanjayrohith/webhook_gateway) [![Docker Compose](https://img.shields.io/badge/docker-compose-ready-6b92ce)](https://docs.docker.com/compose/) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## Problem

Modern applications receive webhooks from Stripe, Stripe, Shopify, GitHub, Razorpay, and others — but most ingress pipelines fail silently when:

1. **Frameworks parse JSON before signature verification.** Express, FastAPI, and most frameworks parse the raw body into JSON *before* your handler code runs, destroying the exact byte sequence needed for HMAC signature verification. Days are lost building custom raw-body middleware.
2. **Events are lost during deploys.** Rolling restarts, database migrations holding table locks, or cold starts mean dropped webhooks. Provider retry policies vary wildly — some retry only twice before giving up.
3. **Duplicates cause real damage.** Providers retry on timeout even when the request succeeded. Without dedup at ingress, you get double-provisioned accounts and duplicate charge emails.
4. **Failures are unobservable.** When a webhook doesn't produce its expected effect, there's no way to tell whether it arrived, failed signature check, timed out downstream, or was never delivered.

Sluice solves all four problems with a single gateway.

---

## Features

### 🚀 Ingestion API

- **POST `/in/:source_id`** — Accept webhooks at a single endpoint
- **Raw body capture** — Captures raw request bytes *before* framework parsing, preserving exact byte sequences for signature verification
- **Body size cap** — Configurable 1MB default prevents memory exhaustion
- **Timestamp tolerance** — Rejects replayed payloads outside configurable window (default 5 minutes, following Stripe's convention)
- **Signature verification** — Verifies provider signatures using constant-time comparison. Supports:
  - GitHub (`X-Hub-Signature-256`, HMAC-SHA256)
  - Stripe (`Stripe-Signature`, timestamped v1/v2 digests)
  - Stripe (`Stripe-Signature`, timestamped v1/v2 digests)
  - Stripe (`Stripe-Signature`, timestamped v1/v2 digests)
  - Razorpay (`X-Razorpay-Signature`, HMAC-SHA256 hex)
  - Custom providers via configurable JSONPath and secret
- **Rejection recording** — Invalid signatures are recorded in `rejected_events` with full headers and payload snippets for debugging
- **Idempotent insertion** — `ON CONFLICT (source_id, dedup_key) DO NOTHING` prevents duplicate deliveries while still returning 200 so providers stop retrying

### 📦 Event Queue

- **PostgreSQL-backed queue** — Durable, reliable event storage
- **Configurable dedup** — Extract dedup keys from payloads via configurable JSONPath expressions (e.g., `$.id` for Stripe, `$.payload.payment.entity.id` for Razorpay)
- **Unique constraint** — `UNIQUE (source_id, dedup_key)` prevents duplicate deliveries while returning 200 so providers stop retrying
- **Header storage** — Full headers stored as JSONB for debugging and replay
- **Trace context** — W3C `traceparent` stored on queued rows, propagated to downstream deliveries for trace continuity
- **Status tracking** — `pending` → `running` → `completed` or `dead` lifecycle with full audit trail

### 🚀 Dispatcher

- **Batch claiming** — Workers claim batches using `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 20`, enabling horizontal scaling without serialization
- **Per-destination rate limiting** — Configurable requests-per-second limits per destination with token bucket throttling
- **Concurrency limits** — Per-destination concurrent request limits using counting semaphores
- **Request timeouts** — Per-destination timeouts with AbortController treating timeouts as retryable
- **Retry with exponential backoff** — `delay = min(base * 2^attempts, cap) * (0.5 + rand*0.5)` with 5s base, 6h cap, max 12 attempts, ~24h coverage
  - **Downstream Retry-After** — Respects `Retry-After` headers on 429/503 responses for exact retry scheduling
- **Delivery metadata** — Forwards original headers plus `X-Slue-Event-Id`, `X-Slue-Attempt`, and `traceparent` for trace continuity
- **Success classifier** — 2xx = success, 4xx other than 408/429 = permanent failure → DLQ, 408/429 = retryable
- **DLQ** — Exhausted events moved to dead-letter queue after max attempts

### 🔄 Event Transformation

- **QuickJS sandbox** — User transformation scripts run in QuickJS WASM sandbox with 100ms CPU timeout and memory ceiling
- **Global isolation** — Strict whitelist: no `fetch`, no `require`, no `process`, no filesystem or network access
- **Script caching** — Transforms compiled once per source, bytecode cached for subsequent deliveries
- **Event fan-out** — Returning multiple `destinations` from a transform creates separate delivery rows, each retried independently
- **Result dropping** — Returning `null` filters the event entirely; returning an object updates the payload

### 📊 Observability

- **OpenTelemetry** — Full tracing via OTLP HTTP exporter, exporting to Jaeger
- **Structured JSON logs** — Every log line includes `trace_id` and `span_id` for log-trace correlation
- **Prometheus metrics** — Exposes `/metrics` for queue depth, delivery outcomes, retry counts
- **Delivery tracking** — Per-attempt status, latency, and HTTP response snapshots

### 🛠️ Administration

- **Admin API** — REST endpoints for event listing, detail views, and replay/replay
- **Full-text search** — `tsvector` + `GIN` index over raw payloads for payload search
- **DLQ management** — View and bulk-requeue dead-letter queue events
- **Header preservation** — Preserve and view original webhook headers from ingestion through delivery

---

## Quick Start

```bash
# 1. Clone and start
git clone https://github.com/sanjayrohith/webhook_gateway.git
cd webhook_gateway
cp .env.example .env
# Edit .env with your DATABASE_URL and preferred settings

# 2. Start the gateway
docker compose up -d

# 3. Verify it's running
curl http://localhost:3000/health/live
# Should return 200

# 3. Post a test webhook (GitHub style)
curl -X POST http://localhost:3000/in/github \
  -H "X-GitHub-Event: push" \
  -H "X-Hub-Signature-256: sha256=test" \
  -d '{"head_commit": {"id": "abc123", "message": "test"}}'
```

---

## Documentation

- **Transforms** — Per-source JavaScript transformation scripts that filter, transform payloads, and fan-out to multiple destinations. Scripts run in a QuickJS sandbox with 100ms timeout and strict global isolation (no `fetch`, no `require`, no `process`).
- **Transforms documentation** — See `docs/transforms.md` for the API and a Stripe `invoice.paid` example.
- **Transform examples** — Example scripts in `transforms/` directory.

### Admin UI

- Browse events with filters (source, status, time range, full-text search)
- View event payloads, headers, and delivery attempt history
- One-click event replay
- DLQ view with bulk requeue
- Full-text search over payloads using Postgres `tsvector`

---

## Requirements

| Requirement | Details |
|---|---|
| **Node.js** | `>=22` |
| **Database** | PostgreSQL with `pg` driver |
| **Docker** | `docker compose` for local deployment |
| **OpenTelemetry** | Optional OTel SDK for tracing |
| **Admin UI** | Optional React admin UI frontend |

---

## Quick Start — Docker

```bash
# Start the full stack
docker compose up -d
```

The stack includes:
- **Sluice gateway** — HTTP ingestion + queue + dispatch
- **Postgres** — Event queue with dedup, retry, DLQ
- **OTel Collector** — Tracing export to Jaeger
- **Prometheus** — Metrics scraping

---

## License

MIT. See [LICENSE](LICENSE) for details.

---

## Get in Touch

- **GitHub**: [@sanjayrohith](https://github.com/sanjayrohith)
- **Repository**: [webhook_gateway](https://github.com/sanjayrohith/webhook_gateway)
- **Source**: [GitHub](https://github.com/sanjayrohith/webhook_gateway)