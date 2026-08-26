"use client";

import React, { useEffect, useState } from "react";
import { Activity, Battery, Sun, Zap, ShieldAlert, Leaf, Coins, CheckCircle } from "lucide-react";

interface SiteTelemetry {
  site_id: string;
  site_name?: string;
  brand: string;
  solar_generation_kw: number;
  facility_load_kw: number;
  battery_soc_pct: number;
  battery_soh_pct: number;
  grid_online: boolean;
  current_tariff_kes: number;
  energy_health_score: number;
  optimization: {
    primary_command: string;
    dispatch_log: {
      grid_draw_kw: number;
      battery_discharge_kw: number;
      battery_charge_kw: number;
      diesel_draw_kw: number;
      solar_utilized_kw: number;
    };
  };
  fault_alerts: Array<{ severity: string; type: string; message: string }>;
  carbon_intelligence: {
    co2_saved_kg_current: number;
    cumulative_co2_saved_metric_tons: number;
    total_clean_energy_generated_mwh: number;
    diesel_generators_displaced_liters: number;
  };
}

export default function EnergyControlRoom() {
  const [sites, setSites] = useState<SiteTelemetry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterTenant, setFilterTenant] = useState<string>('');
  const [filterAssetType, setFilterAssetType] = useState<string>('');

  const [selectedSite, setSelectedSite] = useState('VUMA-THK-IND');
  const [upgradeKwh, setUpgradeKwh] = useState(1000);
  const [costKes, setCostKes] = useState(3500000);
  const [simResult, setSimResult] = useState<{annual_savings_kes: number; payback_period_years: number | string; annual_co2_offset_tonnes: number} | null>(null);
  const [simulating, setSimulating] = useState(false);

  const [newOrgName, setNewOrgName] = useState('Kericho Tea Estate');
  const [newAssetType, setNewAssetType] = useState('AGRICULTURAL');
  const [newBrand, setNewBrand] = useState('VICTRON_ENERGY');
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardedMessage, setOnboardedMessage] = useState<string | null>(null);
  const [onboardedTenants, setOnboardedTenants] = useState<{id: string; name: string}[]>([]);

  const handleOnboardNewAsset = async () => {
    setIsOnboarding(true);
    setOnboardedMessage(null);

    const generatedTenantId = 'ORG-' + newOrgName.toUpperCase().replace(/\s+/g, '-');
    const generatedSiteId = 'VUMA-' + newOrgName.substring(0, 3).toUpperCase() + '-NODE';

    try {
      let url: string;
      let payload: Record<string, unknown>;

      if (newBrand === 'HUAWEI_SUN2000') {
        url = 'http://127.0.0.1:8013/api/v1/telemetry/huawei';
        payload = {
          "metadata": {
            "brand": "HUAWEI",
            "device_uid": generatedSiteId,
            "timestamp": new Date().toISOString(),
            "tenant_id": generatedTenantId,
            "asset_type": newAssetType
          },
          "registers": {
            "tenant_id": generatedTenantId,
            "asset_type": newAssetType,
            "active_power_output_kw": 25.0,
            "total_current_load_kw": 20.1,
            "bess_state_of_charge_pct": 70.0,
            "battery_health_soh": 99.0,
            "grid_voltage_status": 1,
            "active_tariff_kes": 19.80
          }
        };
      } else {
        url = 'http://127.0.0.1:8013/api/v1/telemetry/victron';
        payload = {
          "victron_venus_payload": {
            "tenant_id": generatedTenantId,
            "asset_type": newAssetType,
            "system_id": generatedSiteId,
            "epoch_time": Math.floor(Date.now() / 1000),
            "pv_yield_kw": 45.0,
            "consumption_ac_load_kw": 38.5,
            "soc_percentage": 80.0,
            "battery_health_pct": 98.5,
            "grid_state": "connected",
            "kplc_cost_per_kwh": 19.80
          }
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setOnboardedMessage(`Device Successfully Activated! Webhook configuration synced. Generated Tenant ID: ${generatedTenantId}.`);
        setOnboardedTenants(prev => [...prev, { id: generatedTenantId, name: newOrgName }]);
      }
    } catch (err) {
      console.error("Device activation pipeline crash:", err);
    } finally {
      setIsOnboarding(false);
    }
  };

  const executeInvestmentSimulation = async () => {
    setSimulating(true);
    try {
      const res = await fetch('http://127.0.0.1:8013/api/v1/analytics/simulate-investment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: selectedSite,
          upgraded_capacity_kwh: Number(upgradeKwh),
          estimated_cost_kes: Number(costKes)
        })
      });
      const metrics = await res.json();
      setSimResult(metrics);
    } catch (err) {
      console.error('Simulation pipeline runtime exception:', err);
    } finally {
      setSimulating(false);
    }
  };

  useEffect(() => {
    async function fetchGridState() {
      try {
        let url = 'http://127.0.0.1:8013/api/v1/dashboard/state?';
        if (filterTenant) url += `tenant_id=${filterTenant}&`;
        if (filterAssetType) url += `asset_type=${filterAssetType}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Data pipeline connection failed");
        const data = await response.json();
        setSites(data);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Connecting to central VumaGrid engine...");
      } finally {
        setLoading(false);
      }
    }

    fetchGridState();
    const interval = window.setInterval(fetchGridState, 3000);
    return () => window.clearInterval(interval);
  }, [filterTenant, filterAssetType]);

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Booting VumaGrid Control Terminal...</div>;
  }

  return (
    <main className="min-h-screen bg-[#0B0F19] p-6 text-gray-100">
      <header className="mb-6 flex flex-col gap-4 border-b border-gray-800 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-wider text-emerald-400">
            <Activity className="animate-pulse" /> VUMAGRID // NATIONAL DERMS CORE
          </h1>
          <p className="mt-1 font-mono text-xs text-gray-400">Nairobi, Kenya Area Dispatch Optimization Hub</p>
        </div>

         <div className="flex flex-wrap items-center gap-3">
          <a
            href={`http://127.0.0.1:8013/api/v1/analytics/export-esg-report${filterTenant ? `?tenant_id=${filterTenant}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-xs px-3 py-1.5 rounded transition flex items-center gap-2 border border-emerald-500 font-bold"
          >
            <Leaf className="w-3.5 h-3.5" /> EXPORT ESG AUDIT REPORT (PDF)
          </a>

          {error ? (
            <div className="rounded border border-red-900 bg-red-950/40 px-3 py-1.5 text-xs font-mono text-red-400">
              ⚠️ LINK DOWN: {error}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded border border-emerald-900 bg-emerald-950/40 px-3 py-1.5 text-xs font-mono text-emerald-400">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              SYNCHRONIZED METRICS ENGAGED // PIPELINE OK
            </div>
          )}
         </div>
      </header>

      <section className="mb-6 bg-[#121826] border border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row gap-4 justify-between items-center font-mono text-xs">
        <div className="text-gray-400">
          ACTIVE INTERFACE SCOPE: <span className="text-emerald-400 font-bold">{filterTenant || filterAssetType ? 'ISOLATED TENANT MATRIX' : 'GLOBAL SHOWCASE NETWORK'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <select value={filterAssetType} onChange={(e) => setFilterAssetType(e.target.value)} className="bg-[#1C2333] border border-gray-700 rounded px-2.5 py-1.5 text-white">
              <option value="">ALL ASSET CLASSES (SHOWCASE)</option>
              <option value="COMMERCIAL">COMMERCIAL FACILITIES</option>
              <option value="AGRICULTURAL">AGRICULTURAL FARMS</option>
              <option value="RESIDENTIAL">RESIDENTIAL PROPERTIES</option>
            </select>
          </div>
          <div>
            <select value={filterTenant} onChange={(e) => setFilterTenant(e.target.value)} className="bg-[#1C2333] border border-gray-700 rounded px-2.5 py-1.5 text-white">
              <option value="">ALL CORPORATE TENANTS</option>
              <option value="ORG-UPTOWN-HEALTHCARE">Uptown Healthcare Group</option>
              <option value="ORG-THIKA-TEXTILES">Thika Textile Holdings</option>
              <option value="ORG-RIFT-AGRI">Rift Valley Agriculture</option>
              {onboardedTenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {sites.map((site) => (
          <div key={site.site_id} className="relative overflow-hidden rounded-xl border border-gray-800 bg-[#121826] p-5 shadow-2xl">
            <div
              className={`absolute left-0 right-0 top-0 h-1 ${
                site.optimization?.primary_command.includes("EMERGENCY")
                  ? "bg-red-500"
                  : site.optimization?.primary_command.includes("PEAK_SHAVE")
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
            />

            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold tracking-tight">{site.site_name || site.site_id}</h3>
                <span className="rounded bg-gray-800 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-gray-400">
                  {site.brand} INVERTER CONTROLLER
                </span>
              </div>
              <div className="text-right">
                <span className="block text-2xl font-black font-mono text-emerald-400">{site.energy_health_score}</span>
                <span className="text-[9px] uppercase tracking-wider text-gray-500">HEALTH SCORE</span>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 font-mono">
              <div className="flex items-center gap-3 rounded-lg bg-[#1C2333] p-3">
                <Sun className="h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <span className="block text-xs text-gray-400">SOLAR YIELD</span>
                  <span className="text-md font-bold">{site.solar_generation_kw} kW</span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg bg-[#1C2333] p-3">
                <Zap className="h-5 w-5 shrink-0 text-blue-400" />
                <div>
                  <span className="block text-xs text-gray-400">DEMAND LOAD</span>
                  <span className="text-md font-bold">{site.facility_load_kw} kW</span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg bg-[#1C2333] p-3">
                <Battery className={`${site.battery_soc_pct < 30 ? "text-red-400" : "text-emerald-400"} h-5 w-5 shrink-0`} />
                <div>
                  <span className="block text-xs text-gray-400">BESS CAPACITY</span>
                  <span className="text-md font-bold">
                    {site.battery_soc_pct}% <span className="text-[10px] text-gray-500">SoC</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg bg-[#1C2333] p-3">
                <Coins className="h-5 w-5 shrink-0 text-yellow-500" />
                <div>
                  <span className="block text-xs text-gray-400">KPLC TARIFF</span>
                  <span className="text-md font-bold text-yellow-400">
                    {site.current_tariff_kes} <span className="text-[9px] text-gray-400">KES/kWh</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-gray-800 bg-slate-950/60 p-3 font-mono text-xs">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">🤖 Active Optimization Control Log</div>
              <div className="mb-3 rounded border-l-2 border-emerald-500 bg-emerald-950/20 py-1 pl-2 font-bold text-emerald-400">
                ⚡ COMMAND: {site.optimization?.primary_command.replace(/_/g, " ")}
              </div>

              <div className="space-y-1.5 text-[11px] text-gray-400">
                <div className="flex justify-between">
                  <span>Grid Sourcing Draw:</span>
                  <span className="font-bold text-gray-200">{site.optimization?.dispatch_log?.grid_draw_kw} kW</span>
                </div>
                <div className="flex justify-between">
                  <span>Battery Load Discharge:</span>
                  <span className="font-bold text-gray-200">{site.optimization?.dispatch_log?.battery_discharge_kw} kW</span>
                </div>
                <div className="flex justify-between">
                  <span>Battery Charge Absorption:</span>
                  <span className="font-bold text-gray-200">{site.optimization?.dispatch_log?.battery_charge_kw} kW</span>
                </div>
                <div className="flex justify-between">
                  <span>Diesel Generator Override:</span>
                  <span className="font-bold text-gray-200">{site.optimization?.dispatch_log?.diesel_draw_kw} kW</span>
                </div>
              </div>
            </div>

            {site.carbon_intelligence && (
              <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-900/30 bg-emerald-950/20 p-2.5 font-mono text-xs text-emerald-300">
                <div className="flex items-center gap-2">
                  <Leaf className="h-4 w-4 text-emerald-400" />
                  <span>Carbon Avoided Tracker:</span>
                </div>
                <span className="font-bold">{site.carbon_intelligence.cumulative_co2_saved_metric_tons} Tonnes CO₂</span>
              </div>
            )}

            <div>
              <div className="mb-2 text-[10px] font-mono font-bold uppercase tracking-wider text-gray-500">⚠️ Diagnostics Subsystem Arrays</div>
              {site.fault_alerts && site.fault_alerts.length > 0 ? (
                <div className="space-y-2">
                  {site.fault_alerts.map((alert, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <span className="block text-[10px] font-mono font-bold tracking-wide">{alert.type}</span>
                        <p className="mt-0.5 font-sans text-[11px] text-red-300">{alert.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-gray-900 bg-gray-950/40 px-3 py-1.5 text-xs font-mono text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  Array registers operational. No critical safety warnings flagged.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-8 border-t border-gray-800 pt-6">
        <h2 className="text-xl font-bold text-amber-400 mb-4 flex items-center gap-2 font-mono">
          📊 STRATEGIC ASSET INVESTMENT SIMULATOR (WHAT-IF ANALYSIS)
        </h2>
        <div className="bg-[#121826] border border-gray-800 rounded-xl p-5 grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
          <div className="space-y-3 font-mono text-xs text-gray-300">
            <div>
              <label className="block text-gray-500 mb-1">TARGET FACILITY GRID NODE</label>
              <select value={selectedSite} onChange={(e) => setSelectedSite(e.target.value)} className="w-full bg-[#1C2333] border border-gray-700 rounded p-2 text-white">
                <option value="VUMA-THK-IND">Thika Textile Factory</option>
                <option value="VUMA-NBO-HOSP">Nairobi Uptown Hospital</option>
                <option value="VUMA-MSA-MALL">Mombasa Retail Center</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-500 mb-1">PROPOSED BESS STORAGE UPGRADE (kWh)</label>
              <input type="number" value={upgradeKwh} onChange={(e) => setUpgradeKwh(Number(e.target.value))} className="w-full bg-[#1C2333] border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label className="block text-gray-500 mb-1">TOTAL ASSET ACQUISITION COST (KES)</label>
              <input type="number" value={costKes} onChange={(e) => setCostKes(Number(e.target.value))} className="w-full bg-[#1C2333] border border-gray-700 rounded p-2 text-white" />
            </div>
            <button onClick={executeInvestmentSimulation} disabled={simulating} className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold p-2.5 rounded transition font-sans text-sm tracking-wide">
              {simulating ? 'COMPUTING EXPANSION MATRIX...' : 'RUN DECISION CORE RUNTIME'}
            </button>
          </div>

          <div className="md:col-span-3 bg-slate-950/80 rounded-xl border border-gray-800 p-5 min-h-[180px] flex flex-col justify-center">
            {simResult ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
                <div className="border border-gray-800 p-4 rounded-lg bg-[#121826]/40">
                  <span className="text-[10px] text-gray-500 block uppercase">Projected Annual Savings</span>
                  <span className="text-xl font-bold text-emerald-400">KES {simResult.annual_savings_kes.toLocaleString()}</span>
                </div>
                <div className="border border-gray-800 p-4 rounded-lg bg-[#121826]/40">
                  <span className="text-[10px] text-gray-500 block uppercase">Amortized Payback Window</span>
                  <span className="text-xl font-bold text-amber-400">{simResult.payback_period_years} Years</span>
                </div>
                <div className="border border-gray-800 p-4 rounded-lg bg-[#121826]/40">
                  <span className="text-[10px] text-gray-500 block uppercase">Incremental ESG Carbon Offset</span>
                  <span className="text-xl font-bold text-blue-400">{simResult.annual_co2_offset_tonnes} Metric Tons/Yr</span>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 text-xs font-mono">
                Enter proposed capital infrastructure bounds and execute the decision matrix solver to render real-time payback simulations.
              </div>
            )}
           </div>
        </div>
      </section>

      <section className="mt-8 border-t border-gray-800 pt-6 mb-12">
        <h2 className="text-xl font-bold text-emerald-400 mb-4 flex items-center gap-2 font-mono">
          SELF-SERVICE HARDWARE ONBOARDING GATEWAY (NEW USER ACCELERATOR)
        </h2>
        <div className="bg-[#121826] border border-gray-800 rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">

          <div className="space-y-3 font-mono text-xs text-gray-300 md:col-span-1">
            <div>
              <label className="block text-gray-500 mb-1">FACILITY / PROPERTY NAME</label>
              <input type="text" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} className="w-full bg-[#1C2333] border border-gray-700 rounded p-2 text-white" placeholder="e.g. Kericho Tea Estate" />
            </div>
            <div>
              <label className="block text-gray-500 mb-1">ASSET CLASSIFICATION MATRIX</label>
              <select value={newAssetType} onChange={(e) => setNewAssetType(e.target.value)} className="w-full bg-[#1C2333] border border-gray-700 rounded p-2 text-white">
                <option value="AGRICULTURAL">AGRICULTURAL FARM / PLANTATION</option>
                <option value="RESIDENTIAL">RESIDENTIAL ESTATE / SMART HOME</option>
                <option value="COMMERCIAL">COMMERCIAL BUSINESS PARK</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-500 mb-1">NATIVE HARDWARE MANUFACTURER INVERTER BRAND</label>
              <select value={newBrand} onChange={(e) => setNewBrand(e.target.value)} className="w-full bg-[#1C2333] border border-gray-700 rounded p-2 text-white">
                <option value="VICTRON_ENERGY">VICTRON ENERGY (VENUS OS CORE)</option>
                <option value="HUAWEI_SUN2000">HUAWEI SMART PV SYSTEM</option>
              </select>
            </div>
            <button onClick={handleOnboardNewAsset} disabled={isOnboarding} className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold p-2.5 rounded transition font-sans text-sm tracking-wide">
              {isOnboarding ? 'ESTABLISHING HANDSHAKE LINK...' : 'GENERATE WEBHOOK & INITIALIZE ASSET'}
            </button>
          </div>

          <div className="md:col-span-2 bg-slate-950/80 rounded-xl border border-gray-800 p-5 min-h-[160px] flex flex-col justify-center font-mono">
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">VumaGrid Automated Webhook Provisioning Terminal</div>
            {onboardedMessage ? (
              <div className="space-y-3 text-xs">
                <p className="text-emerald-400 font-bold">{onboardedMessage}</p>
                <div className="bg-[#121826] p-3 rounded border border-gray-800 text-[11px] text-gray-400 select-all cursor-pointer">
                  {'// Production Integration Endpoint Hook - Paste this straight into your physical device gateway config:'}<br/>
                  <span className="text-yellow-400 font-bold">{'http://api.vumagrid.ke' + (newBrand === 'HUAWEI_SUN2000' ? '/telemetry/huawei' : '/telemetry/victron') + '?tenant_id=' + 'ORG-' + newOrgName.toUpperCase().replace(/\s+/g, '-')}</span>
                </div>
                <p className="text-gray-500 text-[11px] font-sans">Tip: Now scroll up to your &apos;Active Corporate Tenants&apos; filter menu at the top of your dashboard. Select your newly onboarded asset to view its metrics stream isolations live!</p>
              </div>
            ) : (
              <div className="text-center text-gray-500 text-xs py-4">
                Awaiting new entity parameters. Register a custom smart-home or plantation node above to simulate cross-network self-service automation pipelines.
              </div>
            )}
          </div>

        </div>
      </section>
    </main>
  );
}
