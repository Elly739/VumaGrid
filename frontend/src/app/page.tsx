"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Battery, CheckCircle2, ChevronRight, CircleHelp, Clock3, Leaf, MapPin, RefreshCw, Search, Sun, Zap } from "lucide-react";
import { apiRequest, apiUrl, setAccessToken } from "@/lib/api";

type Alert = { severity: string; type: string; message: string };
type Site = {
  tenant_id: string; site_id: string; site_name?: string; data_source?: string; brand: string;
  timestamp?: string; solar_generation_kw: number; facility_load_kw: number; battery_soc_pct: number;
  battery_soh_pct: number; grid_online: boolean; current_tariff_kes: number; energy_health_score: number;
  optimization?: { primary_command: string; dispatch_log?: { grid_draw_kw: number; battery_discharge_kw: number } };
  fault_alerts?: Alert[];
};
type Sample = { timestamp: string; solar_generation_kw: number; facility_load_kw: number };

function age(value?: string) {
  if (!value) return "No timestamp";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 1 ? "Just now" : minutes + " min ago";
}
function number(value: number) { return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(value || 0); }

export default function OperationsDashboard() {
  const [sites, setSites] = useState<Site[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [tenant, setTenant] = useState("");
  const [tenants, setTenants] = useState<Array<{tenant_id:string;site_count:number}>>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [accessToken, setAccessTokenInput] = useState("");
  const [hasAccessToken, setHasAccessToken] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const query = tenant ? "?tenant_id=" + encodeURIComponent(tenant) : "";
      const data = await apiRequest<Site[]>("/api/v1/dashboard/state" + query);
      setSites(data);
      setError("");
      setUpdated(new Date());
      setSelected((current) => data.some((site) => site.site_id === current) ? current : (data[0]?.site_id || ""));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load site data."); }
    finally { setLoading(false); }
  }, [tenant]);

  useEffect(() => {
    setHasAccessToken(Boolean(window.sessionStorage.getItem("vumagrid-access-token")));
    refresh();
    apiRequest<Array<{tenant_id:string;site_count:number}>>("/api/v1/tenants").then(setTenants).catch(() => undefined);
    const timer = window.setInterval(refresh, 10000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const connectWithToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAccessToken(accessToken.trim());
    setHasAccessToken(Boolean(accessToken.trim()));
    setError("");
    refresh();
  };

  const disconnect = () => {
    setAccessToken("");
    setHasAccessToken(false);
    setError("A valid bearer access token is required.");
  };

  const active = sites.find((site) => site.site_id === selected) || sites[0];
  useEffect(() => {
    if (!active) { setSamples([]); return; }
    let alive = true;
    const query = "?tenant_id=" + encodeURIComponent(active.tenant_id) + "&hours=24";
    apiRequest<Sample[]>("/api/v1/sites/" + encodeURIComponent(active.site_id) + "/history" + query)
      .then((rows) => { if (alive) setSamples(rows); })
      .catch(() => { if (alive) setSamples([]); });
    return () => { alive = false; };
  }, [active?.site_id, active?.tenant_id]);

  const visible = useMemo(() => sites.filter((site) => (site.site_name || site.site_id).toLowerCase().includes(search.toLowerCase())), [sites, search]);
  const alerts = sites.flatMap((site) => (site.fault_alerts || []).map((alert) => ({...alert, site})));
  const critical = alerts.filter((item) => item.severity.toUpperCase() === "CRITICAL").length;
  const needsAttention = sites.filter((site) => !site.grid_online || site.battery_soc_pct < 25 || (site.fault_alerts?.length || 0) > 0).length;
  const totalSolar = sites.reduce((sum, site) => sum + (site.solar_generation_kw || 0), 0);
  const totalLoad = sites.reduce((sum, site) => sum + (site.facility_load_kw || 0), 0);
  const maxPower = Math.max(1, ...samples.flatMap((sample) => [sample.solar_generation_kw, sample.facility_load_kw]));
  const chartPoints = (key: "solar_generation_kw" | "facility_load_kw") => samples.map((row, i) => {
    const x = samples.length < 2 ? 0 : i * 600 / (samples.length - 1);
    const y = 146 - ((row[key] || 0) / maxPower) * 120;
    return (i ? "L" : "M") + x + " " + y;
  }).join(" ");

  return <main className="ops-shell">
    <aside className="ops-sidebar">
      <a className="ops-brand" href="#"><span className="brand-mark"><Activity size={19}/></span><span>vuma<span className="brand-light">grid</span><small>ENERGY OPERATIONS</small></span></a>
      <div className="nav-label">WORKSPACE</div>
      <a className="nav-item active"><Activity size={17}/>Overview</a>
      <a className="nav-item" href="#sites"><MapPin size={17}/>Sites <span className="nav-count">{sites.length}</span></a>
      <a className="nav-item" href="#alerts"><AlertTriangle size={17}/>Alerts {alerts.length > 0 && <span className="nav-count alert-count">{alerts.length}</span>}</a>
      <div className="nav-label nav-spaced">TOOLS</div>
      <a className="nav-item" href="#performance"><Zap size={17}/>Performance</a>
      <a className="nav-item" href={apiUrl("/api/v1/analytics/export-esg-report" + (tenant ? "?tenant_id=" + encodeURIComponent(tenant) : ""))}><Leaf size={17}/>ESG report</a>
      <div className="sidebar-bottom"><div className="operator"><span className="operator-avatar">OP</span><span>Operations team<small>Control room</small></span><CircleHelp size={16}/></div><div className="sidebar-note">Vuma Grid DERMS <span>v1.1</span></div></div>
    </aside>

    <section className="ops-main">
      <header className="ops-topbar">
        <div className="mobile-brand">Vuma<span>Grid</span></div>
        <div className="breadcrumbs">Operations <ChevronRight size={14}/> <b>Portfolio overview</b></div>
        <div className="top-actions"><span className="live-indicator"><i/>Live monitoring</span><span className="updated-label"><Clock3 size={14}/>{updated ? "Updated " + updated.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "Connecting…"}</span>{hasAccessToken && <button className="text-button" onClick={disconnect}>Sign out</button>}<button className="icon-button" aria-label="Refresh data" onClick={refresh}><RefreshCw size={16}/></button></div>
      </header>

      <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow">NATIONAL OPERATIONS</div><h1>Portfolio overview</h1><p>Live health and operating conditions across your distributed energy sites.</p></div>
          <label className="tenant-select"><span>Portfolio</span><select value={tenant} onChange={(event) => setTenant(event.target.value)}><option value="">All portfolios</option>{tenants.map((item) => <option key={item.tenant_id} value={item.tenant_id}>{item.tenant_id} · {item.site_count}</option>)}</select></label>
        </div>

        {error && <div className="connection-alert"><AlertTriangle size={17}/><span><b>Connection issue</b>{error}</span><button onClick={refresh}>Retry</button></div>}
        {error.toLowerCase().includes("bearer access token") && <form className="access-card" onSubmit={connectWithToken}><div><b>Sign in to your site portfolio</b><p>Enter the access token provided by your Vuma Grid administrator. Your token stays in this browser tab.</p></div><input type="password" autoComplete="off" value={accessToken} onChange={(event) => setAccessTokenInput(event.target.value)} placeholder="Bearer access token" aria-label="Bearer access token"/><button type="submit" disabled={!accessToken.trim()}>Connect</button></form>}
        <section className="metric-grid" aria-label="Portfolio summary">
          <article className={"metric-card " + (needsAttention ? "metric-warn" : "")}><div className="metric-top"><span>Sites needing attention</span><span className="metric-icon amber"><AlertTriangle size={17}/></span></div><div className="metric-value">{needsAttention}<small> / {sites.length}</small></div><div className="metric-foot">{critical ? <b className="text-red">{critical} critical alert{critical === 1 ? "" : "s"}</b> : "No critical alerts"}<span>· portfolio health</span></div></article>
          <article className="metric-card"><div className="metric-top"><span>Active alerts</span><span className="metric-icon red"><Zap size={17}/></span></div><div className="metric-value">{alerts.length}</div><div className="metric-foot">Across monitored sites</div></article>
          <article className="metric-card"><div className="metric-top"><span>Solar generation</span><span className="metric-icon green"><Sun size={17}/></span></div><div className="metric-value">{number(totalSolar)}<small> kW</small></div><div className="metric-foot">Current portfolio output</div></article>
          <article className="metric-card"><div className="metric-top"><span>Facility demand</span><span className="metric-icon blue"><Zap size={17}/></span></div><div className="metric-value">{number(totalLoad)}<small> kW</small></div><div className="metric-foot">Current portfolio load</div></article>
        </section>

        <div className="content-grid">
          <section className="panel site-panel" id="sites">
            <div className="panel-heading"><div><h2>Site health</h2><p>Current operating state for each connected site</p></div><span className="count-pill">{visible.length} sites</span></div>
            <div className="site-toolbar"><label className="search-box"><Search size={16}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sites"/></label><span className="updated-label"><i className="tiny-live"/> Auto refresh 10s</span></div>
            <div className="table-scroll"><table><thead><tr><th>SITE</th><th>STATUS</th><th>SOLAR / LOAD</th><th>BATTERY</th><th>HEALTH</th><th>LAST UPDATE</th></tr></thead>
              <tbody>{visible.map((site) => {
                const siteAlerts = site.fault_alerts?.length || 0;
                const status = !site.grid_online ? "Grid offline" : siteAlerts ? "Attention" : "Normal";
                return <tr key={site.tenant_id + site.site_id} onClick={() => setSelected(site.site_id)} className={active?.site_id === site.site_id ? "selected-row" : ""}>
                  <td><button className="site-name-button">{site.site_name || site.site_id}<small>{site.site_id} · {site.brand}</small></button>{site.data_source === "DEMO" && <span className="demo-tag">Demo</span>}</td>
                  <td><span className={"status-chip " + (!site.grid_online ? "status-offline" : siteAlerts ? "status-attention" : "status-normal")}><i/>{status}</span></td>
                  <td><b>{number(site.solar_generation_kw)} kW</b><small className="cell-sub">of {number(site.facility_load_kw)} kW demand</small></td>
                  <td><div className="battery-cell"><Battery size={15}/><b>{Math.round(site.battery_soc_pct)}%</b></div><small className="cell-sub">SOH {Math.round(site.battery_soh_pct)}%</small></td>
                  <td><span className={"health-score " + (site.energy_health_score < 70 ? "health-low" : "")}>{Math.round(site.energy_health_score)}</span></td>
                  <td className="last-seen">{age(site.timestamp)}</td>
                </tr>;
              })}{!visible.length && <tr><td colSpan={6} className="empty-row">{loading ? "Loading site telemetry…" : "No sites match this view."}</td></tr>}</tbody>
            </table></div>
            <div className="panel-foot"><span><i className="tiny-live"/> Telemetry is refreshed every 10 seconds</span><span>Site state is advisory; dispatch controls are not enabled</span></div>
          </section>

          <section className="panel alert-panel" id="alerts">
            <div className="panel-heading"><div><h2>Alert queue</h2><p>Conditions requiring operator review</p></div><span className="count-pill">{alerts.length} open</span></div>
            <div className="alert-list">{alerts.length ? alerts.slice(0, 6).map((item, index) => <article className="alert-item" key={item.site.site_id + item.type + index}><span className={"alert-symbol " + (item.severity.toUpperCase() === "CRITICAL" ? "alert-critical" : "alert-warning")}><AlertTriangle size={16}/></span><div><div className="alert-title">{item.type.replaceAll("_", " ")}<span className={item.severity.toUpperCase() === "CRITICAL" ? "severity-critical" : "severity-warning"}>{item.severity}</span></div><p>{item.message}</p><small>{item.site.site_name || item.site.site_id} · {age(item.site.timestamp)}</small></div></article>) : <div className="no-alerts"><CheckCircle2 size={23}/><b>All clear</b><span>No active fault alerts reported by connected sites.</span></div>}</div>
            <div className="alert-foot">Alerts are generated from reported telemetry conditions.</div>
          </section>
        </div>

        <section className="panel performance-panel" id="performance">
          <div className="panel-heading"><div><h2>Site performance</h2><p>{active ? (active.site_name || active.site_id) + " · Solar generation and facility demand" : "Select a site to inspect its trend"}</p></div><span className="history-label"><Clock3 size={14}/>Last 24 hours</span></div>
          <div className="chart-wrap">{samples.length > 1 ? <><div className="chart-legend"><span><i className="legend-solar"/>Solar generation</span><span><i className="legend-load"/>Facility demand</span></div><svg viewBox="0 0 600 160" preserveAspectRatio="none" role="img" aria-label="Solar and demand trend"><path className="chart-gridline" d="M0 25H600 M0 65H600 M0 105H600 M0 145H600"/><path className="chart-area" d={chartPoints("solar_generation_kw") + " L600 150 L0 150 Z"}/><path className="chart-line solar-line" d={chartPoints("solar_generation_kw")}/><path className="chart-line load-line" d={chartPoints("facility_load_kw")}/></svg><div className="chart-axis"><span>Oldest reading</span><span>Most recent</span></div></> : <div className="chart-empty"><Activity size={21}/><b>{active?.data_source === "DEMO" ? "Waiting for recorded history" : "No history available yet"}</b><span>Trend lines appear after telemetry readings have been stored for this site.</span></div>}</div>
          <div className="panel-foot"><span>History is sourced from stored telemetry</span>{active && <span>{active.data_source === "DEMO" ? "Demo snapshot" : "Live telemetry"} · Current tariff KES {active.current_tariff_kes}/kWh</span>}</div>
        </section>
        <footer className="ops-footer"><span>Vuma Grid DERMS · Operations workspace</span><span>Read-only monitoring · Local time {new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</span></footer>
      </div>
    </section>
  </main>;
}
