# ⚡ VumaGrid (Distributed Energy Resource Management System)

VumaGrid is an enterprise-grade, asset-light **Distributed Energy Resource Management System (DERMS)** built to optimize commercial and industrial clean energy infrastructure across East Africa. 

Instead of deploying heavy physical hardware, VumaGrid acts as a pure software intelligence layer. It securely connects to heterogeneous industrial solar inverters, Battery Energy Storage Systems (BESS), and backup diesel arrays via native manufacturer APIs. By processing telemetry streams in real-time, the platform automates load-shifting, mitigates grid volatility, executes automated peak shaving, and tracks ESG compliance metrics.

---

## 🚀 The Core Engineering Breakthroughs

Most standard portfolio projects focus on simple CRUD architectures (e.g., e-commerce, blogs, social applications). VumaGrid is a deep industrial platform implementing complex backend infrastructure:

1. **Multi-Brand Digital Twin Simulation (`simulator.py`)**
   * Built a high-fidelity asynchronous background engine that emulates native telemetry structures from competing global manufacturers (**Huawei NetEco API, Victron Venus OS, Sungrow iSolarCloud**), proving the system can ingest and manage disparate industrial formats over real network sockets.
2. **Operations Research & Linear Programming Optimization Engine (`optimizer.py`)**
   * Eschewed basic heuristic `if/else` logic in favor of true mathematical optimization. Using the **PuLP (CBC Solver)** library, the backend solves a dynamic linear cost-minimization function every interval, balancing building load requirements against complex Kenyan Time-of-Use (ToU) utility tariff bands (Peak vs. Off-Peak KES pricing matrices).
3. **Automated Fault Detection AI & Anomaly Mapping**
   * Implemented localized data-science tracking models that continuously inspect asset performance variables to isolate systemic faults (e.g., solar yield drops during peak daylight hours indicating inverter trips, or accelerated battery State-of-Health degradation tracking).
4. **Real-Time ESG Data Aggregation**
   * Features a carbon ledger calculator integrating official KPLC grid emission factor metrics to continuously measure and stream environmental impact vectors (CO₂ metric tonnes avoided) down onto live interfaces.

---

## 🧱 Technical System Architecture

```text
[Telemetry Simulator] (Virtual Huawei, Victron, Sungrow)
       │ (JSON Payloads streamed over Asynchronous HTTP Channels)
       ▼
[FastAPI Ingestion Middleware] ──► [In-Memory Live Cache Store]
       │
       ├──► [1. Linear Optimization Brain] (Operations Research via PuLP Math)
       ├──► [2. Fault Detection Engine] (Systemic Anomaly Tracking)
       └──► [3. Carbon Intelligence Ledger] (Real-time ESG Emission Math)
               │
               ▼
[Next.js Energy Control Room UI] (Live Polling Multi-Card Industrial Terminal Hub)
```

---

## 🛠️ Technology Stack & Dependencies

### Backend Ecosystem
* **Python 3.13 / FastAPI:** High-performance asynchronous network routing router framework.
* **PuLP / CBC Solver:** Operations Research optimization framework used to evaluate physical system constraints.
* **Pydantic v2:** Rigorous incoming structural register schema verification and normalization models.

### Frontend Operations Control Room
* **Next.js 14 (App Router) & TypeScript:** Type-safe, optimized client dashboard engine.
* **Tailwind CSS & Shadcn UI Components:** Custom clean dark themes reminiscent of utility SCADA rooms.
* **Lucide React Icons:** Animated diagnostic instrumentation indicators.

---

## 🧑‍💻 Local Installation & Deployment Steps

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
Navigate to `http://localhost:3000` to monitor live automated load shifting across the Nairobi commercial network.