"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Battery, Building2, CheckCircle2, ChevronRight, CircleHelp, Clock3, Leaf, MapPin, Network, PlugZap, RefreshCw, Search, Sun, ThermometerSun, Zap } from "lucide-react";
import { apiRequest, downloadFile, setAccessToken } from "@/lib/api";
import EnergyNetworkScene from "@/components/EnergyNetworkScene";

type View = "overview" | "network" | "sites" | "alerts" | "performance";
type Alert = { id: number; severity: string; type: string; message: string; acknowledged_at?: string | null };
type Site = {
  tenant_id: string; site_id: string; site_name?: string; data_source?: string; asset_type: string; brand: string;
  timestamp?: string; solar_generation_kw: number; facility_load_kw: number; battery_soc_pct: number;
  battery_soh_pct: number; grid_online: boolean; current_tariff_kes: number; energy_health_score: number;
  optimization?: { primary_command: string; dispatch_log?: { grid_draw_kw: number; battery_discharge_kw: number; battery_charge_kw?: number } };
  fault_alerts?: Alert[];
  grid_import_kw?: number; battery_charge_kw?: number; battery_discharge_kw?: number;
  solar_curtailed_kw?: number; unserved_load_kw?: number; ev_charger_kw?: number;
  heat_pump_kw?: number; other_load_kw?: number;
  power_flow_source?: string; load_breakdown_source?: string;
  power_flow_basis?: string; load_breakdown_basis?: string;
};
type Sample = { timestamp: string; solar_generation_kw: number; facility_load_kw: number };

const views: Record<View, { title: string; description: string }> = {
  overview: { title: "Overview", description: "A quick read on your portfolio. Start here to see what needs attention." },
  network: { title: "Energy network", description: "Follow power from grid, solar, and storage into site loads." },
  sites: { title: "Sites", description: "Inspect live operating conditions for each site you are authorized to access." },
  alerts: { title: "Alerts", description: "Review fault conditions reported by telemetry from your sites." },
  performance: { title: "Performance", description: "Compare recent solar generation and facility demand for one site." },
};
function number(value: number) { return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(value || 0); }
function power(value: number) { return new Intl.NumberFormat("en-KE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value || 0); }
function secondsAgo(value?: string, now = Date.now()) {
  if (!value) return "No telemetry received";
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  return seconds < 60 ? "Updated " + seconds + "s ago" : "Updated " + Math.floor(seconds / 60) + "m ago";
}

export default function OperationsDashboard() {
  const [view, setView] = useState<View>("overview");
  const [sites, setSites] = useState<Site[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [tenant, setTenant] = useState("");
  const [tenants, setTenants] = useState<Array<{tenant_id:string;site_count:number}>>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const [accessToken, setAccessTokenInput] = useState("");
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [alertFilter, setAlertFilter] = useState<"all" | "critical" | "warning">("all");
  const sessionVersion = useRef(0);

  const navigate = (next: View) => {
    setView(next);
    window.history.pushState({ view: next }, "", "#" + next);
  };

  const refresh = useCallback(async () => {
    const requestVersion = sessionVersion.current;
    try {
      const query = tenant ? "?tenant_id=" + encodeURIComponent(tenant) : "";
      const data = await apiRequest<Site[]>("/api/v1/dashboard/state" + query);
      if (requestVersion !== sessionVersion.current) return;
      setSites(data);
      setError("");
      setUpdated(new Date());
      setSelected((current) => data.some((site) => site.site_id === current) ? current : (data[0]?.site_id || ""));
    } catch (err) {
      if (requestVersion !== sessionVersion.current) return;
      setError(err instanceof Error ? err.message : "Could not load site data.");
    } finally {
      if (requestVersion === sessionVersion.current) setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    const knownViews: View[] = ["overview", "network", "sites", "alerts", "performance"];
    const syncView = () => {
      const route = window.location.hash.replace("#", "") as View;
      if (knownViews.includes(route)) setView(route);
    };
    syncView();
    window.addEventListener("popstate", syncView);
    window.addEventListener("hashchange", syncView);
    setHasAccessToken(Boolean(window.sessionStorage.getItem("vumagrid-access-token")));
    refresh();
    apiRequest<Array<{tenant_id:string;site_count:number}>>("/api/v1/tenants").then(setTenants).catch(() => undefined);
    const poll = window.setInterval(refresh, 5000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener("popstate", syncView);
      window.removeEventListener("hashchange", syncView);
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [refresh]);

  const connectWithToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sessionVersion.current += 1;
    setAccessToken(accessToken.trim());
    setAccessTokenInput("");
    setHasAccessToken(Boolean(accessToken.trim()));
    setError("");
    refresh();
  };
  const disconnect = () => {
    sessionVersion.current += 1;
    setAccessToken("");
    setAccessTokenInput("");
    setHasAccessToken(false);
    setSites([]);
    setSamples([]);
    setTenants([]);
    setTenant("");
    setSelected("");
    setUpdated(null);
    setLoading(false);
    setError("A valid bearer access token is required.");
  };

  const active = sites.find((site) => site.site_id === selected) || sites[0];
  const activeSiteId = active?.site_id;
  const activeTenantId = active?.tenant_id;
  const reloadHistory = useCallback(async () => {
    const requestVersion = sessionVersion.current;
    if (!activeSiteId || !activeTenantId) { setSamples([]); return; }
    try {
      const query = "?tenant_id=" + encodeURIComponent(activeTenantId) + "&hours=24";
      const rows = await apiRequest<Sample[]>("/api/v1/sites/" + encodeURIComponent(activeSiteId) + "/history" + query);
      if (requestVersion !== sessionVersion.current) return;
      setSamples(rows);
    } catch {
      if (requestVersion === sessionVersion.current) setSamples([]);
    }
  }, [activeSiteId, activeTenantId]);
  useEffect(() => {
    reloadHistory();
    const poll = window.setInterval(reloadHistory, 5000);
    return () => window.clearInterval(poll);
  }, [reloadHistory]);

  const visible = useMemo(() => sites.filter((site) => (site.site_name || site.site_id).toLowerCase().includes(search.toLowerCase())), [sites, search]);
  const alerts = sites.flatMap((site) => (site.fault_alerts || []).map((alert) => ({...alert, site})));
  const visibleAlerts = alerts.filter((item) => alertFilter === "all" || item.severity.toLowerCase() === alertFilter);
  const critical = alerts.filter((item) => item.severity.toUpperCase() === "CRITICAL").length;
  const needsAttentionSites = sites.filter((site) => !site.grid_online || site.battery_soc_pct < 25 || (site.fault_alerts?.length || 0) > 0);
  const needsAttention = needsAttentionSites.length;
  const totalSolar = sites.reduce((sum, site) => sum + (site.solar_generation_kw || 0), 0);
  const totalLoad = sites.reduce((sum, site) => sum + (site.facility_load_kw || 0), 0);
  const latestTelemetry = Math.max(0, ...sites.map((site) => site.timestamp ? new Date(site.timestamp).getTime() : 0));
  const latestSite = sites.find((site) => site.timestamp && new Date(site.timestamp).getTime() === latestTelemetry);
  const feedAge = latestTelemetry ? Math.max(0, Math.floor((now - latestTelemetry) / 1000)) : null;
  const feedState = feedAge === null ? "waiting" : feedAge <= 15 ? "receiving" : "stale";
  const maxPower = Math.max(1, ...samples.flatMap((sample) => [sample.solar_generation_kw, sample.facility_load_kw]));
  const chartPoints = (key: "solar_generation_kw" | "facility_load_kw") => samples.map((row, i) => {
    const x = samples.length < 2 ? 0 : i * 600 / (samples.length - 1);
    const y = 146 - ((row[key] || 0) / maxPower) * 120;
    return (i ? "L" : "M") + x + " " + y;
  }).join(" ");
  const isFlowSnapshot = active?.power_flow_basis === "dispatch snapshot; flow meters unavailable";
  const networkFlow = {
    solar: active?.solar_generation_kw || 0,
    grid: isFlowSnapshot ? active?.optimization?.dispatch_log?.grid_draw_kw || 0 : active?.grid_import_kw || 0,
    batteryCharge: isFlowSnapshot ? active?.optimization?.dispatch_log?.battery_charge_kw || 0 : active?.battery_charge_kw || 0,
    batteryDischarge: isFlowSnapshot ? active?.optimization?.dispatch_log?.battery_discharge_kw || 0 : active?.battery_discharge_kw || 0,
    curtailed: active?.solar_curtailed_kw || 0,
    unserved: active?.unserved_load_kw || 0,
    ev: active?.ev_charger_kw || 0,
    heatPump: active?.heat_pump_kw || 0,
    other: active?.other_load_kw || 0,
    demand: active?.facility_load_kw || 0,
  };
  const networkLoads = [
    { label: "EV charging", value: networkFlow.ev, icon: <PlugZap size={15}/> },
    { label: "Heat pump", value: networkFlow.heatPump, icon: <ThermometerSun size={15}/> },
    { label: "Other site loads", value: active?.load_breakdown_source === "unavailable" ? 0 : networkFlow.other, icon: <Building2 size={15}/> },
  ];
  const networkLoadTotal = networkLoads.reduce((sum, load) => sum + load.value, 0);
  const networkSourceTotal = networkFlow.solar + networkFlow.grid + networkFlow.batteryDischarge;
  const networkSinkTotal = networkFlow.demand - networkFlow.unserved + networkFlow.batteryCharge + networkFlow.curtailed;
  const networkBalanceDelta = networkSourceTotal - networkSinkTotal;

  const exportReport = async () => {
    try {
      const query = tenant ? "?tenant_id=" + encodeURIComponent(tenant) : "";
      await downloadFile("/api/v1/analytics/export-esg-report" + query, "VumaGrid-ESG-summary.pdf");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the ESG report.");
    }
  };

  const acknowledgeAlert = async (alertId: number) => {
    try {
      await apiRequest(`/api/v1/alerts/${alertId}/acknowledge`, { method: "POST" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not acknowledge this alert.");
    }
  };

  const siteTable = <section className="panel site-panel">
    <div className="panel-heading"><div><h2>Site health</h2><p>Live status and key readings from each connected site</p></div><span className="count-pill">{visible.length} sites</span></div>
    <div className="site-toolbar"><label className="search-box"><Search size={16}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sites"/></label><span className="updated-label"><i className="tiny-live"/> Auto refresh every 5 seconds</span></div>
    <div className="table-scroll"><table><thead><tr><th>SITE</th><th>STATUS</th><th>SOLAR / LOAD</th><th>BATTERY</th><th>HEALTH</th><th>LAST READING</th></tr></thead>
      <tbody>{visible.map((site) => {
        const siteAlerts = site.fault_alerts?.length || 0;
        const status = !site.grid_online ? "Grid offline" : siteAlerts ? "Attention" : "Normal";
        return <tr key={site.tenant_id + site.site_id} onClick={() => { setSelected(site.site_id); navigate("performance"); }} className={active?.site_id === site.site_id ? "selected-row" : ""}>
          <td><button className="site-name-button">{site.site_name || site.site_id}<small>{site.site_id} · {site.brand}</small></button>{(site.data_source === "DEMO" || site.data_source === "SIMULATED") && <span className="demo-tag">{site.data_source === "SIMULATED" ? "Simulated" : "Demo snapshot"}</span>}</td>
          <td><span className={"status-chip " + (!site.grid_online ? "status-offline" : siteAlerts ? "status-attention" : "status-normal")}><i/>{status}</span></td>
          <td><b>{number(site.solar_generation_kw)} kW</b><small className="cell-sub">of {number(site.facility_load_kw)} kW demand</small></td>
          <td><div className="battery-cell"><Battery size={15}/><b>{Math.round(site.battery_soc_pct)}%</b></div><small className="cell-sub">SOH {Math.round(site.battery_soh_pct)}%</small></td>
          <td><span className={"health-score " + (site.energy_health_score < 70 ? "health-low" : "")}>{Math.round(site.energy_health_score)}</span></td>
          <td className="last-seen">{secondsAgo(site.timestamp, now)}</td>
        </tr>;
      })}{!visible.length && <tr><td colSpan={6} className="empty-row">{loading ? "Loading site telemetry…" : "No sites match this view."}</td></tr>}</tbody>
    </table></div>
    <div className="panel-foot"><span><i className="tiny-live"/> Readings refresh every 5 seconds while the simulator is running</span><span>Select a row to open site performance</span></div>
  </section>;

  const alertList = <section className="panel alert-panel">
    <div className="panel-heading"><div><h2>Alert queue</h2><p>Fault conditions reported by the telemetry rules engine</p></div><span className="count-pill">{alerts.length} active</span></div>
    <div className="alert-filters" role="group" aria-label="Filter alerts">
      {(["all", "critical", "warning"] as const).map((filter) => <button key={filter} className={alertFilter === filter ? "filter-active" : ""} onClick={() => setAlertFilter(filter)}>{filter === "all" ? "All alerts" : filter[0].toUpperCase() + filter.slice(1)}<span>{filter === "all" ? alerts.length : alerts.filter((item) => item.severity.toLowerCase() === filter).length}</span></button>)}
    </div>
    <div className="alert-list">{visibleAlerts.length ? visibleAlerts.map((item) => <article className="alert-item" key={item.id}><span className={"alert-symbol " + (item.severity.toUpperCase() === "CRITICAL" ? "alert-critical" : "alert-warning")}><AlertTriangle size={16}/></span><div><div className="alert-title">{item.type.replaceAll("_", " ")}<span className={item.severity.toUpperCase() === "CRITICAL" ? "severity-critical" : "severity-warning"}>{item.severity}</span></div><p>{item.message}</p><small>{item.site.site_name || item.site.site_id} · Reading {secondsAgo(item.site.timestamp, now)}</small></div><div className="alert-actions"><button className="alert-site-link" onClick={() => { setSelected(item.site.site_id); navigate("sites"); }}>View site</button>{item.acknowledged_at ? <span className="acknowledged-label">Acknowledged</span> : <button className="alert-acknowledge" onClick={() => acknowledgeAlert(item.id)}>Acknowledge</button>}</div></article>) : <div className="no-alerts"><CheckCircle2 size={23}/><b>{alerts.length ? "No alerts in this filter" : "No active conditions"}</b><span>{alerts.length ? "Choose another severity to see reported conditions." : "Your sites are not currently reporting a rule-based fault."}</span></div>}</div>
    <div className="alert-foot">Acknowledgements are recorded by time; user-level identity and alert assignment are not available yet.</div>
  </section>;

  const performance = <section className="performance-view">
    <div className="performance-controls panel"><label className="tenant-select"><span>Choose a site</span><select value={active?.site_id || ""} onChange={(event) => setSelected(event.target.value)}>{sites.map((site) => <option key={site.site_id} value={site.site_id}>{site.site_name || site.site_id}</option>)}</select></label><span className="history-label"><Clock3 size={14}/>Recent stored readings · 24h window</span></div>
    {active ? <div className="metric-grid performance-metrics">
      <article className="metric-card"><div className="metric-top"><span>Solar generation now</span><span className="metric-icon green"><Sun size={17}/></span></div><div className="metric-value">{number(active.solar_generation_kw)}<small> kW</small></div><div className="metric-foot">{secondsAgo(active.timestamp, now)}</div></article>
      <article className="metric-card"><div className="metric-top"><span>Facility demand now</span><span className="metric-icon blue"><Zap size={17}/></span></div><div className="metric-value">{number(active.facility_load_kw)}<small> kW</small></div><div className="metric-foot">Current site load</div></article>
      <article className="metric-card"><div className="metric-top"><span>Battery state</span><span className="metric-icon amber"><Battery size={17}/></span></div><div className="metric-value">{Math.round(active.battery_soc_pct)}<small>%</small></div><div className="metric-foot">Health {Math.round(active.battery_soh_pct)}%</div></article>
    </div> : <div className="panel empty-performance">No sites are available in this portfolio.</div>}
    <section className="panel performance-panel">
      <div className="panel-heading"><div><h2>Generation and demand</h2><p>{active ? (active.site_name || active.site_id) + (active.data_source === "SIMULATED" ? " · Synthetic demo simulation" : " · Site telemetry") : "Select a site to view its trend"}</p></div><span className="history-label">{samples.length} readings · up to 24h</span></div>
      <div className="chart-wrap">{samples.length > 1 ? <><div className="chart-legend"><span><i className="legend-solar"/>Solar generation</span><span><i className="legend-load"/>Facility demand</span></div><svg viewBox="0 0 600 160" preserveAspectRatio="none" role="img" aria-label="Solar generation and demand trend"><path className="chart-gridline" d="M0 25H600 M0 65H600 M0 105H600 M0 145H600"/><path className="chart-area" d={chartPoints("solar_generation_kw") + " L600 150 L0 150 Z"}/><path className="chart-line solar-line" d={chartPoints("solar_generation_kw")}/><path className="chart-line load-line" d={chartPoints("facility_load_kw")}/></svg><div className="chart-axis"><span>Oldest stored reading</span><span>Most recent</span></div></> : <div className="chart-empty"><Activity size={21}/><b>{active?.data_source === "DEMO" ? "Demo snapshot is not a live stream" : "Waiting for simulator readings"}</b><span>Start backend/simulator.py to send changing telemetry every five seconds.</span></div>}</div>
      <div className="panel-foot"><span>Showing up to 500 recent stored samples from the past 24 hours</span>{active && <span>{active.site_id} · KES {active.current_tariff_kes}/kWh</span>}</div>
    </section>
    <section className="panel recent-readings"><div className="panel-heading"><div><h2>Recent readings</h2><p>Latest samples received by the backend</p></div></div><div className="table-scroll"><table><thead><tr><th>TIME</th><th>SOLAR</th><th>FACILITY DEMAND</th><th>DIFFERENCE</th></tr></thead><tbody>{samples.slice(-8).reverse().map((sample,index) => <tr key={sample.timestamp + index}><td>{new Date(sample.timestamp).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}</td><td>{number(sample.solar_generation_kw)} kW</td><td>{number(sample.facility_load_kw)} kW</td><td>{number(sample.solar_generation_kw - sample.facility_load_kw)} kW</td></tr>)}</tbody></table></div></section>
  </section>;

  const energyNetwork = <section className="energy-network">
    <header className="network-heading">
      <div><span className="network-eyebrow"><i/> LIVE MICROGRID MODEL</span><h2>{active?.site_name || active?.site_id || "No site selected"}</h2><p>{active?.site_id || "Choose a site with telemetry"} · {active?.power_flow_basis || "Waiting for power-flow telemetry"}</p></div>
      <label className="network-site-select"><span>Site</span><select value={active?.site_id || ""} onChange={(event) => setSelected(event.target.value)}>{sites.map((site) => <option key={site.site_id} value={site.site_id}>{site.site_name || site.site_id}</option>)}</select></label>
    </header>

    <div className="network-kpis">
      <article className="network-kpi"><span>Solar generation</span><strong>{number(networkFlow.solar)} <small>kW</small></strong><div><Sun size={14}/> PV inverter output</div></article>
      <article className="network-kpi"><span>Grid import</span><strong>{number(networkFlow.grid)} <small>kW</small></strong><div className={active?.grid_online ? "network-good" : "network-warn"}><Zap size={14}/>{active?.grid_online ? "Grid connected" : "Islanded operation"}</div></article>
      <article className="network-kpi"><span>Battery state</span><strong>{Math.round(active?.battery_soc_pct || 0)}<small>%</small></strong><div><Battery size={14}/>{networkFlow.batteryDischarge > 0 ? `${number(networkFlow.batteryDischarge)} kW discharging` : networkFlow.batteryCharge > 0 ? `${number(networkFlow.batteryCharge)} kW charging` : "Standby"}</div></article>
      <article className="network-kpi"><span>Site demand</span><strong>{number(networkFlow.demand)} <small>kW</small></strong><div className={networkFlow.unserved > 0 ? "network-warn" : "network-good"}><Building2 size={14}/>{networkFlow.unserved > 0 ? `${number(networkFlow.unserved)} kW unserved` : "Load supplied"}</div></article>
    </div>

    <div className="network-layout">
      <section className="network-panel network-flow-panel">
        <div className="network-panel-heading"><div><h3>Power flow</h3><p>Current site balance · updates with telemetry</p></div><span className="network-live-tag"><i/> {active ? secondsAgo(active.timestamp, now) : "No feed"}</span></div>
        {active ? <div className="network-stage" role="group" aria-label={`Energy network for ${active.site_name || active.site_id}`}>
          <EnergyNetworkScene
            solarKw={networkFlow.solar}
            gridKw={networkFlow.grid}
            batteryChargeKw={networkFlow.batteryCharge}
            batteryDischargeKw={networkFlow.batteryDischarge}
            evKw={networkLoads[0].value}
            heatPumpKw={networkLoads[1].value}
            gridOnline={active.grid_online}
          />
          <div className="scene-wash" aria-hidden="true"/>
          <div className={`network-node node-grid ${active.grid_online ? "node-online" : "node-offline"}`}><span className="node-icon"><Zap size={20}/></span><span className="node-label">UTILITY GRID</span><strong>{active.grid_online ? `${number(networkFlow.grid)} kW` : "OFFLINE"}</strong><small>{active.grid_online ? "Import meter" : "Island mode"}</small></div>
          <div className="network-node node-battery"><span className="node-icon"><Battery size={20}/></span><span className="node-label">BESS</span><strong>{number(networkFlow.batteryDischarge || networkFlow.batteryCharge)} kW</strong><small>{Math.round(active.battery_soc_pct)}% state of charge</small><div className="battery-track"><i style={{ width: `${Math.min(100, Math.max(0, active.battery_soc_pct))}%` }}/></div></div>
          <div className="network-node node-solar"><span className="node-icon"><Sun size={20}/></span><span className="node-label">PV INVERTER</span><strong>{number(networkFlow.solar)} kW</strong><small>{number(networkFlow.curtailed)} kW curtailed</small></div>
          <div className="network-node node-facility"><span className="node-icon"><Building2 size={22}/></span><span className="node-label">SITE BUS</span><strong>{number(networkFlow.demand)} kW</strong><small>{active.asset_type} · {active.brand}</small></div>
          <div className="network-node node-ev"><span className="node-icon"><PlugZap size={18}/></span><span className="node-label">EV CHARGING</span><strong>{number(networkLoads[0].value)} kW</strong><small>{networkLoads[0].value > 0 ? "Active demand" : "Idle / not metered"}</small></div>
          <div className="network-node node-heat"><span className="node-icon"><ThermometerSun size={18}/></span><span className="node-label">HEAT PUMP</span><strong>{number(networkLoads[1].value)} kW</strong><small>{networkLoads[1].value > 0 ? "Active demand" : "Idle / not metered"}</small></div>
        </div> : <div className="network-empty">Waiting for a site telemetry reading.</div>}
        <div className="network-panel-foot"><span>Flows are measurements or a labeled dispatch snapshot, not control commands.</span><span>{active?.load_breakdown_basis || "End-use data unavailable"}</span></div>
      </section>

      <aside className="network-panel network-breakdown">
        <div className="network-panel-heading"><div><h3>Load breakdown</h3><p>Latest demand by end use</p></div><span className="network-count">{networkLoads.filter((load) => load.value > 0).length} active</span></div>
        <div className="load-breakdown-list">{networkLoads.map((load) => <div className="load-breakdown-row" key={load.label}><div className="load-row-top"><span>{load.icon}{load.label}</span><b>{number(load.value)} kW</b></div><div className="load-meter"><i style={{ width: `${networkLoadTotal ? Math.min(100, (load.value / networkLoadTotal) * 100) : 0}%` }}/></div><small>{networkLoadTotal ? `${Math.round((load.value / networkLoadTotal) * 100)}% of current load` : "No submeter reading"}</small></div>)}</div>
        <div className="network-balance"><span>Supply / demand</span><div><b>{power(networkSourceTotal)}</b><span> / </span><b>{power(networkSinkTotal)}</b><small>{Math.abs(networkBalanceDelta) <= 0.2 ? "Balanced within telemetry precision" : `${power(Math.abs(networkBalanceDelta))} kW balance delta`} · source / sink</small></div></div>
        {networkFlow.unserved > 0 && <div className="network-unserved"><AlertTriangle size={15}/> {number(networkFlow.unserved)} kW of demand is not supplied</div>}
      </aside>
    </div>

    <section className="network-panel network-history">
      <div className="network-panel-heading"><div><h3>Generation and demand trend</h3><p>{active?.site_name || "Selected site"} · stored telemetry</p></div><span className="network-count">{samples.length} points</span></div>
      {samples.length > 1 ? <><div className="network-chart-legend"><span><i className="legend-solar"/>Solar</span><span><i className="legend-load"/>Facility demand</span></div><svg className="network-trend" viewBox="0 0 600 160" preserveAspectRatio="none" role="img" aria-label="Recent solar generation and demand"><path className="network-chart-grid" d="M0 25H600 M0 65H600 M0 105H600 M0 145H600"/><path className="network-chart-area" d={chartPoints("solar_generation_kw") + " L600 150 L0 150 Z"}/><path className="network-chart-line solar-line" d={chartPoints("solar_generation_kw")}/><path className="network-chart-line load-line" d={chartPoints("facility_load_kw")}/></svg><div className="network-axis"><span>Oldest sample</span><span>Latest sample</span></div></> : <div className="network-empty compact">Start the simulator to build a live trend.</div>}
    </section>
  </section>;

  return <main className="ops-shell">
    <aside className="ops-sidebar">
      <button className="ops-brand" onClick={() => navigate("overview")}><span className="brand-mark"><Activity size={19}/></span><span>vuma<span className="brand-light">grid</span><small>ENERGY OPERATIONS</small></span></button>
      <div className="nav-label">WORKSPACE</div>
      <button className={"nav-item " + (view === "overview" ? "active" : "")} onClick={() => navigate("overview")}><Activity size={17}/>Overview</button>
      <button className={"nav-item " + (view === "network" ? "active" : "")} onClick={() => navigate("network")}><Network size={17}/>Energy network</button>
      <button className={"nav-item " + (view === "sites" ? "active" : "")} onClick={() => navigate("sites")}><MapPin size={17}/>Sites <span className="nav-count">{sites.length}</span></button>
      <button className={"nav-item " + (view === "alerts" ? "active" : "")} onClick={() => navigate("alerts")}><AlertTriangle size={17}/>Alerts <span className="nav-count alert-count">{alerts.length}</span></button>
      <div className="nav-label nav-spaced">TOOLS</div>
      <button className={"nav-item " + (view === "performance" ? "active" : "")} onClick={() => navigate("performance")}><Zap size={17}/>Performance</button>
      <button className="nav-item" onClick={exportReport}><Leaf size={17}/>ESG report</button>
      <div className="sidebar-bottom"><div className="operator"><span className="operator-avatar">OP</span><span>Operations team<small>Site monitor</small></span><CircleHelp size={16}/></div><div className="sidebar-note">Vuma Grid DERMS <span>v1.1</span></div></div>
    </aside>

    <section className="ops-main">
      <header className="ops-topbar">
        <div className="mobile-brand">Vuma<span>Grid</span></div>
        <div className="breadcrumbs">Operations <ChevronRight size={14}/> <b>{views[view].title}</b></div>
        <div className="top-actions"><span className={"live-indicator " + (feedState === "stale" ? "feed-stale" : feedState === "waiting" ? "feed-waiting" : "")}><i/>{feedState === "receiving" ? (latestSite?.data_source === "SIMULATED" ? "Live simulator feed" : "Live site telemetry") : feedState === "waiting" ? "Waiting for telemetry" : "Telemetry paused"}</span><span className="updated-label"><Clock3 size={14}/>{feedAge === null ? "No readings" : "Last reading " + feedAge + "s ago"}</span>{hasAccessToken && <button className="text-button" onClick={disconnect}>Sign out</button>}<button className="icon-button" aria-label="Refresh data" onClick={refresh}><RefreshCw size={16}/></button></div>
      </header>

      <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow">OPERATIONS WORKSPACE</div><h1>{views[view].title}</h1><p>{views[view].description}</p></div>
          <label className="tenant-select"><span>Portfolio</span><select value={tenant} onChange={(event) => setTenant(event.target.value)}><option value="">All assigned portfolios</option>{tenants.map((item) => <option key={item.tenant_id} value={item.tenant_id}>{item.tenant_id} · {item.site_count} sites</option>)}</select></label>
        </div>

        {error && <div className="connection-alert"><AlertTriangle size={17}/><span><b>Connection issue</b>{error}</span><button onClick={refresh}>Retry</button></div>}
        {error.toLowerCase().includes("bearer access token") && <form className="access-card" onSubmit={connectWithToken}><div><b>Sign in to your site portfolio</b><p>Enter the access token provided by your Vuma Grid administrator. Your token stays in this browser tab.</p></div><input type="password" autoComplete="off" value={accessToken} onChange={(event) => setAccessTokenInput(event.target.value)} placeholder="Bearer access token" aria-label="Bearer access token"/><button type="submit" disabled={!accessToken.trim()}>Connect</button></form>}

        {view === "overview" && <>
          <section className="metric-grid" aria-label="Portfolio summary">
            <article className={"metric-card " + (needsAttention ? "metric-warn" : "")}><div className="metric-top"><span>Sites needing attention</span><span className="metric-icon amber"><AlertTriangle size={17}/></span></div><div className="metric-value">{needsAttention}<small> / {sites.length}</small></div><div className="metric-foot">{critical ? <b className="text-red">{critical} critical alert{critical === 1 ? "" : "s"}</b> : "No active fault alerts"}</div></article>
            <article className="metric-card"><div className="metric-top"><span>Active alerts</span><span className="metric-icon red"><Zap size={17}/></span></div><div className="metric-value">{alerts.length}</div><div className="metric-foot">Reported by site telemetry</div></article>
            <article className="metric-card"><div className="metric-top"><span>Solar generation</span><span className="metric-icon green"><Sun size={17}/></span></div><div className="metric-value">{number(totalSolar)}<small> kW</small></div><div className="metric-foot">Current portfolio output</div></article>
            <article className="metric-card"><div className="metric-top"><span>Facility demand</span><span className="metric-icon blue"><Zap size={17}/></span></div><div className="metric-value">{number(totalLoad)}<small> kW</small></div><div className="metric-foot">Current portfolio load</div></article>
          </section>
          <section className="overview-grid">
            <div className="panel overview-attention"><div className="panel-heading"><div><h2>Start with these sites</h2><p>Sites with grid, battery, or alert conditions</p></div><button className="inline-link" onClick={() => navigate("sites")}>All sites <ChevronRight size={14}/></button></div>
              {needsAttentionSites.length ? needsAttentionSites.slice(0,4).map((site) => <button className="attention-row" key={site.site_id} onClick={() => {setSelected(site.site_id); navigate("sites");}}><span className={!site.grid_online ? "attention-dot red-dot" : "attention-dot amber-dot"}/><span><b>{site.site_name || site.site_id}</b><small>{!site.grid_online ? "Grid connection is offline" : (site.fault_alerts?.[0]?.type.replaceAll("_"," ") || "Review site battery status")}</small></span><span className="attention-status">{!site.grid_online ? "Offline" : site.fault_alerts?.[0]?.severity || "Review"}</span><ChevronRight size={15}/></button>) : <div className="overview-clear"><CheckCircle2 size={22}/><span><b>All sites look healthy</b><small>No reported conditions need review right now.</small></span></div>}
            </div>
            <div className="panel overview-guide"><div className="panel-heading"><div><h2>Where do you want to go?</h2><p>Each workspace answers a different operations question</p></div></div>
              <button className="guide-row" onClick={() => navigate("sites")}><span className="guide-icon"><MapPin size={17}/></span><span><b>Sites</b><small>See live power, battery, and connection status.</small></span><ChevronRight size={15}/></button>
              <button className="guide-row" onClick={() => navigate("network")}><span className="guide-icon performance-guide"><Network size={17}/></span><span><b>Energy network</b><small>Follow grid, solar, storage, and site loads.</small></span><ChevronRight size={15}/></button>
              <button className="guide-row" onClick={() => navigate("alerts")}><span className="guide-icon alert-guide"><AlertTriangle size={17}/></span><span><b>Alerts</b><small>Review reported faults and which site sent them.</small></span><ChevronRight size={15}/></button>
              <button className="guide-row" onClick={() => navigate("performance")}><span className="guide-icon performance-guide"><Activity size={17}/></span><span><b>Performance</b><small>See how solar output and site demand change.</small></span><ChevronRight size={15}/></button>
            </div>
          </section>
        </>}

        {view === "network" && energyNetwork}
        {view === "sites" && siteTable}
        {view === "alerts" && alertList}
        {view === "performance" && performance}

        <footer className="ops-footer"><span>Read-only monitoring · Dispatch controls are not enabled</span><span>{updated ? "Dashboard refreshed " + updated.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"}) : loading ? "Connecting to DERMS…" : "Waiting for site telemetry"}</span></footer>
      </div>
    </section>
  </main>;
}
