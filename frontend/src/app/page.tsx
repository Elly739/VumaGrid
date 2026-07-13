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

  useEffect(() => {
    async function fetchGridState() {
      try {
        const response = await fetch("http://127.0.0.1:8013/api/v1/dashboard/state");
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
  }, []);

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
      </header>

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
    </main>
  );
}
