# ⚡ VumaGrid (Distributed Energy Resource Management System)

![CI Pipeline](https://github.com/Elly739/VumaGrid/actions/workflows/ci.yml/badge.svg)

VumaGrid is an enterprise-grade, asset-light **Distributed Energy Resource Management System (DERMS)** built to optimize commercial and industrial clean energy infrastructure across East Africa.

Instead of deploying heavy physical hardware, VumaGrid acts as a pure software intelligence layer. It securely connects to heterogeneous industrial solar inverters, Battery Energy Storage Systems (BESS), and backup diesel arrays via native manufacturer APIs. By processing telemetry streams in real-time, the platform automates load-shifting, mitigates grid volatility, executes automated peak shaving, and tracks ESG compliance metrics.

---

## 🚀 Core Engineering Breakthroughs

Most standard portfolio projects focus on simple CRUD architectures. VumaGrid is a deep industrial platform implementing complex backend infrastructure:

1. **Multi-Brand Digital Twin Simulation (`simulator.py`)**
   * Built a high-fidelity asynchronous background engine that emulates native telemetry structures from competing global manufacturers (**Huawei NetEco API, Victron Venus OS, Sungrow iSolarCloud**), proving the system can ingest and manage disparate industrial formats over real network sockets.
   * Implements **closed-loop battery state tracking** — State of Charge (SoC) smoothly charges/drains based on solar surplus, grid status, and Time-of-Use tariff windows (bounded 15%–98%) rather than random jumps.

2. **Operations Research & Linear Programming Optimization Engine (`optimizer.py`)**
   * Eschewed basic heuristic `if/else` logic in favor of true mathematical optimization. Using the **PuLP (CBC Solver)** library, the backend solves a dynamic linear cost-minimization function every interval, balancing building load requirements against complex Kenyan Time-of-Use (ToU) utility tariff bands.

3. **What-If Financial Simulation Engine**
   * Runs a dual-scenario LP solve comparing current vs. upgraded battery capacity across historical logs. Instantly outputs annual savings (KES), payback period (years), and incremental CO₂ offset for investor business cases.

4. **Automated Fault Detection AI & Live Safety Webhook Alerts**
   * Continuously inspects asset performance variables to isolate systemic faults (inverter trips, battery degradation, load anomalies).
   * Dispatches real-time safety alerts to external webhook endpoints (Discord/Slack-compatible embed payloads) when anomalies strike.

5. **ESG Carbon Audit PDF Exporter**
   * Generates professional, print-ready compliance documents on-demand using **reportlab**. Reports include carbon metrics, active node states, and legal disclaimers — filterable by corporate tenant.

6. **Multi-Tenant Architecture with Dynamic Routing**
   * Supports tenant-isolated data views via `tenant_id` and `asset_type` query parameters. Corporate clients see only their assets; showcase mode displays the full network.

7. **Self-Service SaaS Onboarding Workflow**
   * New users register their property through a dashboard form. The system generates a unique tenant ID, provisions API endpoints, and instantly populates live metrics — zero code required.

---

## 🧱 Technical System Architecture

```text
[Telemetry Simulator] (Virtual Huawei, Victron, Sungrow)
       │ (JSON Payloads streamed over Asynchronous HTTP Channels)
       ▼
[FastAPI Ingestion Middleware] ──► [In-Memory Live Cache Store]
       │
       ├──► [1. Linear Optimization Brain] (Operations Research via PuLP Math)
       ├──► [2. Fault Detection Engine] → [Webhook Alert Dispatcher]
       ├──► [3. Carbon Intelligence Ledger] (Real-time ESG Emission Math)
       ├──► [4. What-If Investment Simulator] (Dual-Scenario LP Analysis)
       └──► [5. Multi-Tenant Filter Router] (tenant_id / asset_type isolation)
               │
               ▼
[Next.js Energy Control Room UI]
       ├── Live Polling Multi-Card Industrial Terminal
       ├── Dynamic Tenant / Asset Type Filtering
       ├── What-If Investment Simulator Panel
       ├── One-Click ESG PDF Export
       └── Self-Service Onboarding Gateway
```

---

## 🛠️ Technology Stack & Dependencies

### Backend Ecosystem
* **Python 3.13 / FastAPI:** High-performance asynchronous network routing framework.
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

Navigate to `http://localhost:3000` to monitor live automated load shifting across the network.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/dashboard/state` | Live site states with optimization, faults, carbon metrics. Optional `?tenant_id=` and `?asset_type=` filters. |
| `POST` | `/api/v1/telemetry/huawei` | Ingest Huawei SUN2000 inverter telemetry |
| `POST` | `/api/v1/telemetry/victron` | Ingest Victron Venus OS telemetry |
| `POST` | `/api/v1/telemetry/sungrow` | Ingest Sungrow Power telemetry |
| `POST` | `/api/v1/analytics/simulate-investment` | Run what-if battery investment ROI simulation |
| `GET` | `/api/v1/analytics/export-esg-report` | Generate ESG compliance PDF. Optional `?tenant_id=` filter. |
| `POST` | `/api/v1/sandbox/webhook-logger` | Local webhook receiver for testing alert dispatch |

---

## 🏢 Multi-Tenant Structure

| Tenant ID | Site | Asset Type |
|-----------|------|------------|
| ORG-UPTOWN-HEALTHCARE | VUMA-NBO-HOSP | COMMERCIAL |
| ORG-THIKA-TEXTILES | VUMA-THK-IND | COMMERCIAL |
| ORG-RIFT-AGRI | VUMA-NKR-FARM | AGRICULTURAL |

New tenants can be dynamically registered via the Self-Service Onboarding Gateway on the dashboard.

---

## 📄 License

Proprietary — VumaGrid DERMS Platform.
