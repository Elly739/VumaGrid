# ⚡ VumaGrid (Distributed Energy Resource Management System)

![CI Pipeline](https://github.com/Elly739/VumaGrid/actions/workflows/ci.yml/badge.svg)

VumaGrid is an early **Distributed Energy Resource Management System (DERMS) prototype** for commercial and industrial energy sites in East Africa.

The prototype normalizes sample Huawei, Victron, and Sungrow telemetry, stores it locally, and displays site conditions with dispatch and carbon scenarios. It enforces tenant-level access on API reads, analytics, exports, and telemetry ingestion when demo mode is disabled. Vendor APIs, live dispatch, user identity, and per-site roles are not implemented yet.

> **Development prototype status:** Production mode uses configured bearer tokens mapped to tenant IDs; this is a basic service-token boundary, not a complete identity system. Demo mode exposes showcase tenant data to loopback clients and must not be deployed for customer use. Device onboarding still submits a sample reading rather than provisioning a connector, alerts are not persisted or acknowledged in-product, and investment output is experimental. Do not use it for live dispatch or investment decisions.

Current backend state is stored in a local SQLite database (`backend/vumagrid.db` by default). SQLite supports this single-instance development setup; it is not yet a multi-instance production data architecture. For local showcase data, set `VUMAGRID_DEMO_MODE=true` before starting the backend. Demo records are written to the database and persist until that database is removed.

---

## Current prototype capabilities

- A local simulator emits synthetic, vendor-shaped telemetry over HTTP. It is a demo generator, not a calibrated plant simulator or vendor connector.
- The API validates normalized readings and persists latest state and history in SQLite.
- A PuLP dispatch model and battery-upgrade scenario are present, but are not validated for live control or investment decisions.
- Fault rules can send an optional configured webhook when telemetry is ingested. They are threshold rules, not AI diagnosis.
- The PDF export summarizes integrated solar telemetry using a fixed 0.38 kg CO₂/kWh factor. It is not a compliance audit.
- Tenant filters are constrained by the caller's authorized tenant scope in production mode. Demo mode is local-only and bypasses authentication for showcase data.
- Operator tokens are mapped to tenant IDs. Callers see only those tenants' sites, calculated alerts, telemetry history, analytics, and exported site data.
- Separate ingestion tokens are bound to tenant IDs, so a device credential cannot submit telemetry under another tenant.
- Production alert webhooks are routed per tenant. A tenant's alerts go only to that tenant's configured destination.
- The demo does not provision customer sites, devices, integration credentials, or webhooks. The local simulator sends the bundled sample sites.

## How the operator app works

The app opens on **Overview**. The four workspace buttons on the left change the main content; these are separate workspaces, not scroll links. The selected workspace is reflected in the URL hash, so browser back/forward also moves between the recent workspaces.

| Workspace | What it is for | What you can do |
|---|---|---|
| **Overview** (`#overview`) | Decide where to look first across your assigned portfolios. | Review site-attention, alert, solar, and demand totals. Open a site that needs review, or jump to Sites, Alerts, and Performance. |
| **Sites** (`#sites`) | Inspect the operating state of each site in the selected portfolio. | Search sites, compare connection status, solar output, demand, battery state of charge and health, and telemetry freshness. Select a row to open that site's Performance view. |
| **Alerts** (`#alerts`) | Review fault conditions reported by site telemetry. | Filter active conditions by severity, acknowledge them, and use **View site** to inspect the reporting site. Alert records persist and resolve when a later reading clears the condition; assignment and user-attributed audit are not implemented. |
| **Performance** (`#performance`) | Understand how one site is operating over time. | Choose an authorized site, compare stored solar and demand samples, inspect current power and battery values, and review the newest readings. |

The **Portfolio** selector narrows the operator's view. In production mode, the backend limits its choices and every returned site to the tenant IDs assigned to the supplied bearer token; the selector itself is not the security boundary. The top bar shows the age of the latest reading. Sites and history refresh every five seconds. The feed reports **Telemetry paused** when no site has reported recently. The **ESG report** link downloads a tenant-scoped telemetry summary PDF.

### Telemetry and calculation flow

1. `backend/simulator.py` builds a synthetic reading for each bundled site and wraps it in a Huawei-, Victron-, or Sungrow-shaped JSON payload.
2. The corresponding `/api/v1/telemetry/...` endpoint validates and normalizes the payload. In local demo mode, simulator submissions are labeled `SIMULATED` in site state. Outside demo mode, the API ignores that label and checks that the device bearer token is allowed to write for the payload's tenant.
3. `backend/app/storage.py` stores the latest site state and each reading in SQLite.
4. The dashboard polls `/api/v1/dashboard/state` and `/api/v1/sites/{site_id}/history`. The API calculates a dispatch recommendation, health score, and threshold-based alerts from the latest site sample; carbon totals are integrated from stored readings.
5. The browser displays those results within the operator token's tenant scope. The performance view requests up to 500 latest samples from the preceding 24 hours; at a five-second demo cadence this is roughly the latest 42 minutes. The optimizer does not send commands to an inverter, battery, or grid controller.

## How realistic is the simulator?

The current simulator is **useful for exercising the telemetry pipeline and demonstrating changing screens, but it is not a calibrated or validated model of an energy site**. It has a seeded, continuous demo model with a few equipment constraints, but it does not ingest measured weather or site data:

- Solar and loads evolve smoothly from a time-of-day curve, with seeded weather/load variation and fixed equipment limits. These curves are illustrative, not measured profiles.
- Grid interruptions last for a duration instead of flipping independently every sample. The `grid_outage` scenario forces a 30-minute outage at the Nakuru site before recovery; other sites use a low random outage hazard.
- Battery energy is tracked in kWh using a five-second step, charge/discharge efficiency, reserve floor, and site power limits. A power-balance check includes grid draw, curtailment, and any unserved load.
- Battery state of health is fixed per site so the Thika warning is stable. This is a demonstration fixture, not a degradation model.
- Tariff values are hard-coded by hour in the simulator. They are demonstration assumptions, not an imported or verified customer tariff schedule.
- Vendor payloads resemble the three vendors' data shapes, but there is no live connection to vendor APIs, firmware-specific protocol handling, device authentication, or vendor conformance validation.

Choose a scenario with `VUMAGRID_SIMULATION_SCENARIO=normal|cloudy|grid_outage|low_battery` and a repeatable random seed with `VUMAGRID_SIMULATION_SEED=42`. Restart the simulator to apply changes. Treat all simulator output, optimization values, alerts, and carbon/financial estimates as **demonstration data**. The simulator's battery model responds to a simple local power balance, not to the optimizer's recommendation, and is not suitable for control or investment decisions.

### Recommended simulation and DERMS upgrades

1. **Calibrate the scenario engine.** Validate its normal-day, cloudy-day, grid-outage, and low-battery profiles against permissioned site telemetry and refine outage durations, weather, and load curves from measured data.
2. **Expand the plant model.** Add measured weather, seasonal effects, battery thermal behavior and degradation, export and diesel constraints, and realistic tariff schedules; validate these assumptions against pilot data.
3. **Make the optimizer and simulator share the same equipment constraints.** Include site-specific inverter, battery, grid-import, and diesel ratings; tariff schedules; export limits; reserve policy; and the simulator's current stored energy. Feed simulated dispatch back into the next state only in a clearly labeled simulation mode.
4. **Expose data quality and provenance.** Show coverage, missing intervals, source timestamps, and scenario provenance in charts and exports; keep synthetic data visibly distinct from measured site telemetry.
5. **Keep simulation, recommendations, and real control separated.** Add audited operator approval, command validation, device acknowledgements, timeout/fallback behavior, and an emergency stop before connecting this prototype to live dispatch.

The order matters: make the simulated plant internally consistent first, validate the optimizer against it and measured pilot data next, then design a separately reviewed control and approval workflow. “More realistic looking” random charts are not a substitute for calibration or a safe control path.

## Repository structure

```text
.
├── backend/
│   ├── app/
│   │   ├── main.py       # FastAPI routes, telemetry normalization, calculations and report export
│   │   ├── models.py     # Validated normalized telemetry schema
│   │   ├── optimizer.py  # Snapshot dispatch recommendation and experimental investment estimate
│   │   ├── security.py   # Tenant-scoped operator and ingestion token checks
│   │   └── storage.py    # SQLite latest-state and telemetry-history persistence
│   ├── tests/
│   │   ├── test_security.py   # Tenant authorization regression tests
│   │   └── test_simulator.py  # Deterministic simulation and power-balance tests
│   ├── simulator.py      # Synthetic five-second vendor-shaped telemetry sender
│   ├── requirements.txt  # Python dependencies
│   └── .env.example      # Backend environment-variable reference
├── frontend/
│   ├── src/app/
│   │   ├── page.tsx      # Overview, Sites, Alerts and Performance workspaces
│   │   ├── globals.css   # Shared visual system and responsive layout
│   │   └── layout.tsx    # App shell and product metadata
│   ├── src/lib/api.ts   # API origin, request errors and browser bearer token
│   └── package.json     # Next.js scripts and frontend dependencies
├── PRODUCT_UPGRADE_PLAN.md
└── README.md
```

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
* **reportlab:** Programmatic PDF generation for a telemetry summary (not a compliance audit).
* **requests:** Webhook payload delivery to external notification services.

### Frontend Operations Control Room
* **Next.js 14 (App Router) & TypeScript:** Type-safe, optimized client dashboard engine.
* **Tailwind CSS and custom CSS:** Responsive operations layout and component styling.
* **Lucide React Icons:** Animated diagnostic instrumentation indicators.

---

## 🧑‍💻 Local Installation & Deployment

### 1. Backend Central Brain Setup
```bash
cd backend
python -m venv venv
# PowerShell: .\venv\Scripts\Activate.ps1
# Command Prompt: venv\Scripts\activate.bat
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8013
```

For a local showcase, set `VUMAGRID_DEMO_MODE=true` before starting the backend. PowerShell: `$env:VUMAGRID_DEMO_MODE="true"`; macOS/Linux: `export VUMAGRID_DEMO_MODE=true`. Demo mode is restricted to loopback clients by the API. For production mode (`false`), configure the operator and ingestion token mappings before use; the API otherwise denies access.

### 2. Multi-Asset Telemetry Simulator Engine
Open a separate terminal instance and execute:
```bash
cd backend
# PowerShell: .\venv\Scripts\Activate.ps1
# Command Prompt: venv\Scripts\activate.bat
# macOS/Linux: source venv/bin/activate
python simulator.py
```

Keep the simulator running while using the showcase. It sends a new reading for each sample site every five seconds. The operator dashboard polls site state and stored history on the same five-second cadence, shows when the latest site reading arrived, and labels the feed as paused when updates stop.

### 3. Frontend Terminal Control Interface
Open a third terminal instance and execute:
```bash
cd frontend
npm install
npm run dev
```

Navigate to `http://localhost:3000` to monitor simulator or ingested telemetry. The app opens directly to the operator portfolio overview. In local demo mode, it shows the showcase tenants without sign-in. Configure `VUMAGRID_API_URL` in the simulator process environment if the backend is not at `http://127.0.0.1:8013`.

Set `NEXT_PUBLIC_VUMAGRID_API_URL` in `frontend/.env.local` to the FastAPI origin if it is not `http://127.0.0.1:8013`. The backend reads `VUMAGRID_CORS_ORIGINS`, `VUMAGRID_DB_PATH`, and the values described below from its process environment; see `backend/.env.example`. The example file is documentation and is not loaded automatically.

### Run backend tests

From the backend directory, with its virtual environment active:

```bash
python -m unittest discover -s tests -v
```

### Tenant access configuration

For customer-facing use, set `VUMAGRID_DEMO_MODE=false`. The API fails closed when operator tokens are missing or invalid. Set `VUMAGRID_ACCESS_TOKENS` to a JSON object mapping long, unique bearer tokens to one or more tenant IDs. Example:

```json
{"operator-token-from-a-secret-manager":["ORG-UPTOWN-HEALTHCARE"]}
```

The operator enters their token on the dashboard sign-in form. It is kept in the current browser tab's session storage and sent as an `Authorization: Bearer ...` header. The API checks the token on tenant listing, dashboard state, site history, investment analysis, and report export. A tenant outside the token's scope receives `403`; missing or invalid tokens receive `401`. These are shared service credentials: this MVP does not identify individual people, provide in-product revocation or user audit events, or express access to selected sites within a tenant. Store tokens in a secret manager, use TLS, and never commit real secrets.

Telemetry writers use separate credentials. Configure `VUMAGRID_INGESTION_TOKENS` as a JSON object mapping device bearer tokens to tenant IDs. Every telemetry request must carry a device token, and its tenant must match the token scope. Demo mode accepts unauthenticated simulator submissions, so keep it disabled outside a local showcase.

Configure production alert delivery with `VUMAGRID_ALERTS_WEBHOOKS`, a JSON object mapping tenant IDs to separate webhook URLs. Alerts produced from a tenant's telemetry are sent only to that tenant's destination, once when the condition opens. Active alert state and acknowledgement timestamps persist in SQLite; an alert resolves when a later reading clears its condition. Acknowledgements are not attributed to an individual identity, and assignment and durable webhook retries are not implemented.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/dashboard/state` | Caller-scoped site states; optional filters only narrow the authorized tenant set. |
| `GET` | `/api/v1/tenants` | Tenant IDs and site counts visible to the caller. |
| `GET` | `/api/v1/alerts/active` | Active alerts for the caller's authorized tenants. |
| `POST` | `/api/v1/alerts/{alert_id}/acknowledge` | Acknowledge an active alert in an authorized tenant. |
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
