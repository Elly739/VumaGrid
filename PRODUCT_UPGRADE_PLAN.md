# Vuma Grid product and engineering upgrade plan

## Product direction

Build Vuma Grid into an operations platform for commercial and industrial energy portfolios in East Africa. Help operators understand site conditions, investigate issues, plan dispatch, and measure outcomes. Keep recommendations and simulated data clearly distinguished from approved live control.

## Current baseline

- The Next.js app has Overview, Sites, Alerts, and Performance workspaces, with five-second polling, site search, alert severity filters, and recent solar/load history.
- The API origin is configurable through `NEXT_PUBLIC_VUMAGRID_API_URL`; the local default is `http://127.0.0.1:8013`.
- The backend normalizes three vendor-shaped payloads and persists latest site state and telemetry history in SQLite. This is a single-node development store, not a multi-instance production database.
- Production API reads and analytics are scoped by configured tenant bearer tokens; ingestion uses separate tenant-bound device tokens. This is not individual identity, role-based access, or token lifecycle management.
- The bundled simulator emits synthetic vendor-shaped readings. It is not a calibrated plant model, does not drive the optimizer's dispatch back into battery state, and uses uncalibrated outage, load, and battery-health variation.
- Investment analysis requires at least 24 hours and 288 samples and no longer substitutes random data when history is insufficient. It still applies measured state of charge independently to each sample rather than advancing a physical battery model, so results are experimental.
- Dispatch output is a snapshot recommendation only. The API does not send commands to equipment; equipment limits, battery energy progression, approval, acknowledgement, and command audit are not implemented.

## Phased roadmap

### Phase 0 — Product and safety foundations

- Agree on user roles and the first workflow: portfolio operator, site operator, analyst, and administrator.
- Define canonical organization, site, device, telemetry, alert, dispatch recommendation, and audit event models.
- Separate demo data from customer data in the UI and API.
- Document trust boundaries, retention, units, and the distinction between recommendations and control commands.
- Add API schemas, input bounds, consistent errors, health checks, and environment-based configuration.

### Phase 1 — Reliable operations dashboard

- Replace the single page with a responsive application shell and focused portfolio, site detail, alerts, analytics, and settings views.
- Add portfolio KPIs, last-seen freshness, connection state, API-backed filters, and clear loading, empty, and error states.
- Provide site-level power flow, battery health and state of charge, grid status, alerts, and dispatch explanations.
- Make refresh cadence and stale telemetry visible; use server push only after the data service supports it.
- Remove hard-coded demo site options and source entities from the API.

### Phase 2 — Durable and secure backend

- Persist telemetry, tenant/site/device records, alert history, and audit events with migrations.
- Enforce authentication, roles, and tenant isolation from verified identity on every endpoint.
- Replace wildcard CORS and local webhook defaults with explicit configuration and managed secrets.
- Add idempotent ingestion, payload validation/versioning, deduplication, retention, and observability.
- Define connector health and retry behavior for vendor protocols.

### Phase 3 — Trusted DERMS analytics and workflows

- Validate the optimizer against physical constraints, battery limits, efficiencies, reserve margins, tariffs, and grid outages.
- Add scenario provenance, deterministic replay, confidence/coverage indicators, and safe handling when history is insufficient.
- Build alert triage, maintenance workflow, dispatch approval, and a complete command audit trail before real control.
- Reconcile ESG reports to persisted source intervals and configurable emission factors.
- Base investment models on time-series data, equipment specs, degradation, and transparent financial assumptions.

### Phase 4 — Production readiness and scale

- Add unit, integration, contract, security, and end-to-end coverage; CI gates and migration checks.
- Add metrics, structured logs, traces, SLOs, backups/restore, load tests, and incident runbooks.
- Deploy isolated environments with infrastructure as code, secret management, and onboarding/support procedures.
- Validate with a pilot portfolio before closed-loop dispatch or regulatory/financial claims.

## First execution slice

1. Configure the frontend API origin through `NEXT_PUBLIC_VUMAGRID_API_URL` with a local-development default.
2. Centralize API response and error handling for polling, investment simulation, and device activation.
3. Surface request failures in the dashboard and forms.
4. Replace the Next.js starter metadata with Vuma Grid product metadata.

## Delivery order

Complete the first slice, then build one vertical workflow at a time: persistent site inventory and tenant authorization, telemetry history and alert operations, then validated analytics and dispatch approval. Reassess priorities with pilot-user feedback after each phase.

## Progress

- Completed: configurable frontend and simulator API origins; shared frontend request errors and product metadata; SQLite storage for latest site state and telemetry history; opt-in demo seeding; configurable CORS origins and alert webhook; telemetry range validation; side-effect-free dashboard reads; ingestion-triggered fault notifications; carbon totals integrated from stored telemetry; API-backed tenant/site choices; removal of random investment fallback and upfront history coverage checks.
- In progress: the investment scenario now weights power by sample duration and requires explicit battery capacity, but its battery state model is not yet suitable for financial decisions. The operations UI has distinct Overview, Sites, Alerts, and Performance workspaces, authenticated report downloads, and a five-second simulator heartbeat. Tenant-level bearer token checks scope operator reads/analytics/exports; separate device tokens bind ingestion to a tenant. Alert history and acknowledgement timestamps persist per tenant, while individual user attribution, assignment, durable webhook retries, and production device onboarding remain open. Demo mode is loopback-only. Individual user identity, per-site roles, token lifecycle/auditing, and database migrations remain open.
