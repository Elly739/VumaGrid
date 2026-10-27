# ⚡ VumaGrid (Distributed Energy Resource Management System)

![CI Pipeline](https://github.com/Elly739/VumaGrid/actions/workflows/ci.yml/badge.svg)

VumaGrid is an early **Distributed Energy Resource Management System (DERMS) prototype** for commercial and industrial energy sites in East Africa.

The prototype normalizes sample Huawei, Victron, and Sungrow telemetry, stores it locally, and displays site conditions with dispatch and carbon scenarios. It enforces tenant-level access on API reads, analytics, exports, and telemetry ingestion when demo mode is disabled. Vendor APIs, live dispatch, user identity, and per-site roles are not implemented yet.

> **Development prototype status:** Production mode uses configured bearer tokens mapped to tenant IDs; this is a basic service-token boundary, not a complete identity system. Demo mode exposes showcase tenant data to loopback clients and must not be deployed for customer use. Device onboarding still submits a sample reading rather than provisioning a connector, alerts are not persisted or acknowledged in-product, and investment output is experimental. Do not use it for live dispatch or investment decisions.

Current backend state is stored in a local SQLite database (`backend/vumagrid.db` by default). SQLite supports this single-instance development setup; it is not yet a multi-instance production data architecture. For local showcase data, set `VUMAGRID_DEMO_MODE=true` before starting the backend. Demo records are written to the database and persist until that database is removed.

---

## Current prototype capabilities

- A local simulator emits example vendor-shaped telemetry over HTTP. It is a development simulator, not a vendor connector.
- The API validates normalized readings and persists latest state and history in SQLite.
- A PuLP dispatch model and battery-upgrade scenario are present, but are not validated for live control or investment decisions.
- Fault rules can send an optional configured webhook when telemetry is ingested. They are threshold rules, not AI diagnosis.
- The PDF export summarizes integrated solar telemetry using a fixed 0.38 kg CO₂/kWh factor. It is not a compliance audit.
- Tenant filters are constrained by the caller's authorized tenant scope in production mode. Demo mode is local-only and bypasses authentication for showcase data.
- Operator tokens are mapped to tenant IDs. Callers see only those tenants' sites, calculated alerts, telemetry history, analytics, and exported site data.
- Separate ingestion tokens are bound to tenant IDs, so a device credential cannot submit telemetry under another tenant.
- Production alert webhooks are routed per tenant. A tenant's alerts go only to that tenant's configured destination.
- The dashboard sample form writes one example reading. It does not provision sites, devices, integration credentials, or webhooks.

---

## 🧱 Technical System Architecture

```text
[Telemetry Simulator] (Virtual Huawei, Victron, Sungrow)
       │ (JSON Payloads streamed over Asynchronous HTTP Channels)
       ▼
[FastAPI Ingestion Middleware] ──► [SQLite Site State + Telemetry History]
       │
       ├──► [1. Linear Optimization Brain] (Operations Research via PuLP Math)
       ├──► [2. Fault Detection Engine] → [Webhook Alert Dispatcher]
       ├──► [3. Carbon Estimate] (Integrated Solar Intervals, fixed factor)
       ├──► [4. What-If Investment Simulator] (Dual-Scenario LP Analysis)
       └──► [5. Tenant Authorization] (operator and device bearer-token scopes)
               │
               ▼
[Next.js Operations UI]
       ├── Live portfolio overview
       ├── Scoped site health and alert queue
       ├── Stored telemetry history view
       └── Tenant-scoped ESG PDF export
```

---

## 🛠️ Technology Stack & Dependencies

### Backend Ecosystem
* **Python 3.13 / FastAPI:** API and telemetry ingestion framework.
* **PuLP / CBC Solver:** Operations Research optimization framework for physical system constraints.
* **Pydantic v2:** Rigorous incoming structural register schema verification and normalization.
* **reportlab:** Programmatic PDF document generation for compliance audits.
* **requests:** Webhook payload delivery to external notification services.

### Frontend Operations Control Room
* **Next.js 14 (App Router) & TypeScript:** Type-safe, optimized client dashboard engine.
* **Tailwind CSS:** Custom dark themes reminiscent of utility SCADA rooms.
* **Lucide React Icons:** Animated diagnostic instrumentation indicators.

---

## 🧑‍💻 Local Installation & Deployment

### 1. Backend Central Brain Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

For a local showcase, set `VUMAGRID_DEMO_MODE=true` before starting the backend. PowerShell: `$env:VUMAGRID_DEMO_MODE="true"`; macOS/Linux: `export VUMAGRID_DEMO_MODE=true`. Demo mode is restricted to loopback clients by the API. For production mode (`false`), configure the operator and ingestion token mappings before use; the API otherwise denies access.

### 2. Multi-Asset Telemetry Simulator Engine
Open a separate terminal instance and execute:
```bash
cd backend
source venv/bin/activate
python simulator.py
```

### 3. Frontend Terminal Control Interface
Open a third terminal instance and execute:
```bash
cd frontend
npm install
npm run dev
```

Navigate to `http://localhost:3000` to monitor simulator or ingested telemetry. The app opens directly to the operator portfolio overview. In local demo mode, it shows the showcase tenants without sign-in. Configure `VUMAGRID_API_URL` in the simulator process environment if the backend is not at `http://127.0.0.1:8013`.

Set `NEXT_PUBLIC_VUMAGRID_API_URL` in `frontend/.env.local` to the FastAPI origin if it is not `http://127.0.0.1:8013`. The backend reads `VUMAGRID_CORS_ORIGINS`, `VUMAGRID_DB_PATH`, and the values described below from its process environment; see `backend/.env.example`. The example file is documentation and is not loaded automatically.

### Tenant access configuration

For customer-facing use, set `VUMAGRID_DEMO_MODE=false`. The API fails closed when operator tokens are missing or invalid. Set `VUMAGRID_ACCESS_TOKENS` to a JSON object mapping long, unique bearer tokens to one or more tenant IDs. Example:

```json
{"operator-token-from-a-secret-manager":["ORG-UPTOWN-HEALTHCARE"]}
```

The operator enters their token on the dashboard sign-in form. It is kept in the current browser tab's session storage and sent as an `Authorization: Bearer ...` header. The API checks the token on tenant listing, dashboard state, site history, investment analysis, and report export. A tenant outside the token's scope receives `403`; missing or invalid tokens receive `401`. These are shared service credentials: this MVP does not identify individual people, provide in-product revocation or user audit events, or express access to selected sites within a tenant. Store tokens in a secret manager, use TLS, and never commit real secrets.

Telemetry writers use separate credentials. Configure `VUMAGRID_INGESTION_TOKENS` as a JSON object mapping device bearer tokens to tenant IDs. Every telemetry request must carry a device token, and its tenant must match the token scope. Demo mode accepts unauthenticated simulator submissions, so keep it disabled outside a local showcase.

Configure production alert delivery with `VUMAGRID_ALERTS_WEBHOOKS`, a JSON object mapping tenant IDs to separate webhook URLs. Alerts produced from a tenant's telemetry are sent only to that tenant's destination. The legacy single `VUMAGRID_ALERTS_WEBHOOK` is honored only in local demo mode. Alert conditions are recalculated from latest telemetry when the dashboard is read; alert lifecycle state, acknowledgement, assignment, and durable delivery retries are not implemented yet.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/dashboard/state` | Caller-scoped site states; optional filters only narrow the authorized tenant set. |
| `GET` | `/api/v1/tenants` | Tenant IDs and site counts visible to the caller. |
| `GET` | `/api/v1/sites/{site_id}/history` | Site telemetry history; requires an authorized `tenant_id`. |
| `POST` | `/api/v1/telemetry/huawei` | Ingest Huawei telemetry with a tenant-bound device token (not required in local demo mode). |
| `POST` | `/api/v1/telemetry/victron` | Ingest Victron telemetry with a tenant-bound device token (not required in local demo mode). |
| `POST` | `/api/v1/telemetry/sungrow` | Ingest Sungrow telemetry with a tenant-bound device token (not required in local demo mode). |
| `POST` | `/api/v1/analytics/simulate-investment` | Run a scenario for a site in the caller's authorized tenant scope. |
| `GET` | `/api/v1/analytics/export-esg-report` | Generate a report for the requested authorized tenant or all caller-authorized tenants. |
| `POST` | `/api/v1/sandbox/webhook-logger` | Local demo receiver; hidden when demo mode is disabled. |

Investment analysis requires a 24-hour history with at least 288 samples and no gap over 15 minutes, plus a manually supplied current battery capacity. It annualizes the observed window and uses assumed 0.4C discharge and 0.2C charge rates. It does not model battery state progression, seasonality, tariff changes, inverter efficiency, or degradation. Carbon totals integrate intervals up to 15 minutes and use a fixed 0.38 kg CO₂/kWh factor. Tenant query/body values are filters; authorization comes from the bearer token scope.

---

## 🏢 Multi-Tenant Structure

| Tenant ID | Site | Asset Type |
|-----------|------|------------|
| ORG-UPTOWN-HEALTHCARE | VUMA-NBO-HOSP | COMMERCIAL |
| ORG-THIKA-TEXTILES | VUMA-THK-IND | COMMERCIAL |
| ORG-RIFT-AGRI | VUMA-NKR-FARM | AGRICULTURAL |

The listed tenant IDs are showcase records. Tenant-level bearer tokens enforce API access in production mode, but this prototype does not create customer accounts, associate people with organizations, or enforce selected-site roles within a tenant.

---

## 📄 License

Proprietary — VumaGrid DERMS Platform.
