import { useState, useRef, useCallback, useEffect } from "react";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

// ═══════════════════════════════════════════════════════════════════════════════
// SALEMAP HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const MAP_STATUS = {
  visited: { label: "Visited",  color: "#22c55e", emoji: "✅" },
  skip:    { label: "Skip",     color: "#6b7280", emoji: "⏭"  },
  return:  { label: "Go Back!", color: "#f43f5e", emoji: "🔁" },
};

function getSaturdayKey() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 6 ? 0 : day + 1;
  const sat = new Date(d);
  sat.setDate(d.getDate() - diff);
  return `salemap_${sat.toISOString().slice(0, 10)}`;
}

function loadPins() {
  try { return JSON.parse(localStorage.getItem(getSaturdayKey()) || "[]"); }
  catch { return []; }
}
function savePins(pins) {
  try { localStorage.setItem(getSaturdayKey(), JSON.stringify(pins)); } catch {}
}

function projectPin(lat, lng, bounds, w, h) {
  const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * w;
  const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * h;
  return { x, y };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLIPSCOUT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function parseResearch(raw) {
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    return JSON.parse(clean.slice(start, end + 1));
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&family=Syne:wght@700;800&family=Inconsolata:wght@400;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a0f;
    --surface: #12121a;
    --surface2: #1a1a26;
    --border: #2a2a3d;
    --accent: #00e5a0;
    --text: #e8e8f0;
    --muted: #7070a0;
    --ebay-green: #00c853;
    --amazon-orange: #ff9900;
    --danger: #ff4560;
    --warn: #ffd600;
  }

  html, body, #root {
    height: 100%;
    background: var(--bg);
  }

  body {
    font-family: 'DM Sans', sans-serif;
    color: var(--text);
    -webkit-tap-highlight-color: transparent;
  }

  /* ── SHELL ── */
  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  /* ── BOTTOM NAV ── */
  .bottom-nav {
    display: flex;
    background: #0d0d14;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    z-index: 300;
  }

  .nav-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 10px 0 14px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--muted);
    transition: color 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .nav-btn.active { color: var(--accent); }
  .nav-btn.active.map-tab { color: #f59e0b; }

  .nav-icon { font-size: 22px; line-height: 1; }
  .nav-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1px; }

  .nav-btn.active .nav-label { color: inherit; }

  /* ── PAGE CONTAINERS ── */
  .page { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
  .page.scout { overflow-y: auto; }
  .page.map   { overflow: hidden; }

  /* ══════════════════════════════════════════
     FLIPSCOUT STYLES
  ══════════════════════════════════════════ */

  .scout-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--border);
    background: rgba(10,10,15,0.9);
    backdrop-filter: blur(12px);
    position: sticky;
    top: 0;
    z-index: 100;
    flex-shrink: 0;
  }

  .logo { display: flex; align-items: baseline; gap: 2px; }
  .logo-flip { font-family: 'Bebas Neue', sans-serif; font-size: 28px; letter-spacing: 2px; color: var(--accent); line-height: 1; }
  .logo-scout { font-family: 'Bebas Neue', sans-serif; font-size: 28px; letter-spacing: 2px; color: var(--text); line-height: 1; }
  .logo-tag { font-size: 11px; color: var(--muted); font-family: 'DM Mono', monospace; letter-spacing: 1px; margin-left: 8px; }

  .header-pills { display: flex; gap: 8px; }
  .pill { font-size: 10px; font-family: 'DM Mono', monospace; padding: 3px 9px; border-radius: 20px; letter-spacing: 0.5px; }
  .pill-ebay { background: rgba(0,200,83,0.15); color: var(--ebay-green); border: 1px solid rgba(0,200,83,0.3); }
  .pill-amazon { background: rgba(255,153,0,0.15); color: var(--amazon-orange); border: 1px solid rgba(255,153,0,0.3); }

  .scout-main { max-width: 860px; margin: 0 auto; padding: 32px 20px 40px; width: 100%; }

  .input-card { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; overflow: hidden; margin-bottom: 28px; }

  .input-tab-bar { display: flex; border-bottom: 1px solid var(--border); }

  .input-tab {
    flex: 1; padding: 14px; background: none; border: none;
    color: var(--muted); font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: all 0.2s; letter-spacing: 0.3px;
  }
  .input-tab.active { color: var(--accent); background: rgba(0,229,160,0.06); border-bottom: 2px solid var(--accent); margin-bottom: -1px; }
  .input-tab:hover:not(.active) { color: var(--text); background: rgba(255,255,255,0.03); }

  .input-body { padding: 20px; }

  .drop-zone {
    border: 2px dashed var(--border); border-radius: 16px; padding: 40px 20px;
    text-align: center; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden;
  }
  .drop-zone:hover, .drop-zone.drag-over { border-color: var(--accent); background: rgba(0,229,160,0.04); }
  .drop-zone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
  .drop-icon { font-size: 40px; margin-bottom: 10px; display: block; }
  .drop-label { font-size: 15px; font-weight: 500; color: var(--text); margin-bottom: 4px; }
  .drop-sub { font-size: 12px; color: var(--muted); }

  .preview-img { width: 100%; max-height: 240px; object-fit: contain; border-radius: 12px; margin-bottom: 14px; }

  .desc-textarea {
    width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 12px;
    padding: 14px; color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 14px;
    line-height: 1.6; resize: none; transition: border-color 0.2s; outline: none;
  }
  .desc-textarea:focus { border-color: var(--accent); }
  .desc-textarea::placeholder { color: var(--muted); }

  .search-btn {
    width: 100%; margin-top: 16px; padding: 15px; background: var(--accent); color: #0a0a0f;
    border: none; border-radius: 12px; font-family: 'Bebas Neue', sans-serif; font-size: 19px;
    letter-spacing: 3px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .search-btn:hover:not(:disabled) { background: #00f5b0; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,229,160,0.3); }
  .search-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .loading-wrap { text-align: center; padding: 60px 24px; }
  .spinner { width: 44px; height: 44px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 20px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-step { font-size: 13px; color: var(--muted); font-family: 'DM Mono', monospace; animation: fadeP 1.5s ease-in-out infinite; }
  @keyframes fadeP { 0%,100%{opacity:0.4} 50%{opacity:1} }

  .results { display: flex; flex-direction: column; gap: 18px; }

  .item-banner { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 20px 24px; }
  .item-name { font-family: 'Bebas Neue', sans-serif; font-size: 26px; letter-spacing: 1.5px; color: var(--text); margin-bottom: 4px; }
  .item-condition { font-size: 13px; color: var(--muted); font-family: 'DM Mono', monospace; }

  .verdict-card { border-radius: 18px; padding: 20px 24px; display: flex; align-items: flex-start; gap: 16px; border: 1px solid; }
  .verdict-buy  { background: rgba(0,200,83,0.08);  border-color: rgba(0,200,83,0.3); }
  .verdict-maybe{ background: rgba(255,214,0,0.08); border-color: rgba(255,214,0,0.3); }
  .verdict-pass { background: rgba(255,69,96,0.08); border-color: rgba(255,69,96,0.3); }
  .verdict-icon { font-size: 36px; flex-shrink: 0; }
  .verdict-label { font-family: 'Bebas Neue', sans-serif; font-size: 20px; letter-spacing: 2px; margin-bottom: 4px; }
  .verdict-buy .verdict-label  { color: var(--ebay-green); }
  .verdict-maybe .verdict-label{ color: var(--warn); }
  .verdict-pass .verdict-label { color: var(--danger); }
  .verdict-reason { font-size: 13px; color: var(--text); line-height: 1.6; }

  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }
  .metric-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
  .metric-source { font-size: 10px; font-family: 'DM Mono', monospace; letter-spacing: 1px; margin-bottom: 6px; display: flex; align-items: center; gap: 5px; }
  .metric-source.ebay { color: var(--ebay-green); }
  .metric-source.amazon { color: var(--amazon-orange); }
  .metric-value { font-family: 'Bebas Neue', sans-serif; font-size: 32px; letter-spacing: 1px; line-height: 1; margin-bottom: 3px; }
  .metric-label { font-size: 11px; color: var(--muted); }
  .metric-sub { font-size: 11px; color: var(--muted); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); font-family: 'DM Mono', monospace; }

  .section-title {
    font-family: 'Bebas Neue', sans-serif; font-size: 17px; letter-spacing: 2px; color: var(--muted);
    margin-bottom: 12px; display: flex; align-items: center; gap: 10px;
  }
  .section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  .badge { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; padding: 2px 8px; border-radius: 6px; font-family: 'DM Mono', monospace; }
  .badge-count { background: rgba(0,229,160,0.12); color: var(--accent); border: 1px solid rgba(0,229,160,0.25); }

  .sold-list { display: flex; flex-direction: column; gap: 7px; }
  .sold-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; gap: 10px; }
  .sold-title { font-size: 12px; color: var(--text); flex: 1; line-height: 1.4; }
  .sold-price { font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 500; color: var(--ebay-green); white-space: nowrap; }
  .sold-date { font-size: 10px; color: var(--muted); font-family: 'DM Mono', monospace; white-space: nowrap; }
  .sold-condition { font-size: 10px; padding: 2px 7px; border-radius: 4px; background: rgba(0,200,83,0.12); color: var(--ebay-green); white-space: nowrap; }

  /* PROFIT CALC */
  .profit-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 20px; }
  .calc-input-row { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
  .calc-field { flex: 1; min-width: 120px; }
  .option-label { font-size: 11px; color: var(--muted); margin-bottom: 4px; font-family: 'DM Mono', monospace; letter-spacing: 0.5px; }
  .option-input {
    background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
    padding: 9px 12px; color: var(--text); font-family: 'DM Mono', monospace; font-size: 13px;
    outline: none; transition: border-color 0.2s; width: 100%;
  }
  .option-input:focus { border-color: var(--accent); }
  .option-input::placeholder { color: var(--muted); }

  .profit-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
  .profit-row:last-child { border-bottom: none; }
  .profit-row-label { color: var(--muted); }
  .profit-row-value { font-family: 'DM Mono', monospace; font-weight: 500; }
  .profit-positive { color: var(--ebay-green); }
  .profit-negative { color: var(--danger); }
  .profit-neutral  { color: var(--text); }
  .profit-total { display: flex; justify-content: space-between; align-items: center; padding: 14px 0 0; margin-top: 6px; }
  .profit-total-label { font-family: 'Bebas Neue', sans-serif; font-size: 18px; letter-spacing: 1.5px; }
  .profit-total-value { font-family: 'Bebas Neue', sans-serif; font-size: 28px; letter-spacing: 1px; }

  .error-card { background: rgba(255,69,96,0.08); border: 1px solid rgba(255,69,96,0.3); border-radius: 14px; padding: 20px; text-align: center; color: var(--danger); font-size: 13px; }

  .reset-btn { background: none; border: 1px solid var(--border); border-radius: 10px; padding: 9px 18px; color: var(--muted); font-family: 'DM Sans', sans-serif; font-size: 12px; cursor: pointer; transition: all 0.2s; display: block; margin: 0 auto; }
  .reset-btn:hover { color: var(--text); border-color: var(--text); }

  /* ══════════════════════════════════════════
     SALEMAP STYLES
  ══════════════════════════════════════════ */

  .map-header {
    background: #0f0f0f;
    padding: 14px 20px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    border-bottom: 1px solid #222;
    z-index: 50;
  }

  .map-logo { display: flex; align-items: baseline; }
  .map-logo-sale { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
  .map-logo-map  { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 800; color: #f59e0b; letter-spacing: -0.5px; }

  .map-stats { display: flex; gap: 16px; }
  .map-stat { display: flex; flex-direction: column; align-items: center; line-height: 1; }
  .map-stat-num { font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 800; color: #fff; }
  .map-stat-num.green { color: #22c55e; }
  .map-stat-num.gray  { color: #6b7280; }
  .map-stat-num.red   { color: #f43f5e; }
  .map-stat-label { font-family: 'Inconsolata', monospace; font-size: 9px; color: rgba(255,255,255,0.3); letter-spacing: 1px; margin-top: 2px; }

  .map-container { flex: 1; position: relative; overflow: hidden; min-height: 0; }
  .map-iframe { width: 100%; height: 100%; border: none; display: block; }

  .pin-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 10; }

  .map-legend {
    position: absolute; top: 14px; left: 14px; z-index: 100;
    background: rgba(10,10,10,0.88); border: 1px solid #2a2a2a; border-radius: 12px;
    padding: 10px 13px; backdrop-filter: blur(10px); display: flex; flex-direction: column; gap: 6px;
  }
  .legend-item { display: flex; align-items: center; gap: 7px; font-family: 'Inconsolata', monospace; font-size: 11px; color: rgba(255,255,255,0.65); letter-spacing: 0.3px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

  .map-clear-btn {
    position: absolute; top: 14px; right: 14px; z-index: 100;
    background: rgba(10,10,10,0.88); border: 1px solid #2a2a2a; border-radius: 10px;
    padding: 8px 13px; color: rgba(255,255,255,0.4); font-family: 'Inconsolata', monospace;
    font-size: 11px; letter-spacing: 0.5px; cursor: pointer; backdrop-filter: blur(10px); transition: all 0.15s;
  }
  .map-clear-btn:hover { color: #f43f5e; border-color: #f43f5e; }

  .gps-badge {
    position: absolute; bottom: 110px; right: 14px; z-index: 100;
    background: rgba(10,10,10,0.88); border: 1px solid #2a2a2a; border-radius: 20px;
    padding: 6px 13px; font-family: 'Inconsolata', monospace; font-size: 11px;
    color: rgba(255,255,255,0.4); letter-spacing: 0.5px; backdrop-filter: blur(10px);
    display: flex; align-items: center; gap: 7px;
  }
  .gps-dot { width: 7px; height: 7px; border-radius: 50%; background: #6b7280; }
  .gps-dot.on { background: #22c55e; animation: gpsPulse 1.6s ease-in-out infinite; }
  @keyframes gpsPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

  .mark-btn-wrap {
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    z-index: 100; display: flex; flex-direction: column; align-items: center; gap: 8px;
  }
  .mark-btn {
    width: 78px; height: 78px; border-radius: 50%; background: #f59e0b; border: none; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    box-shadow: 0 8px 28px rgba(245,158,11,0.5), 0 2px 8px rgba(0,0,0,0.5); transition: transform 0.1s;
  }
  .mark-btn:active { transform: scale(0.92); }
  .mark-btn-icon  { font-size: 26px; line-height: 1; }
  .mark-btn-label { font-family: 'Inconsolata', monospace; font-size: 10px; font-weight: 600; color: #0f0f0f; letter-spacing: 1px; }
  .mark-hint { font-family: 'Inconsolata', monospace; font-size: 11px; color: rgba(255,255,255,0.45); background: rgba(0,0,0,0.6); padding: 5px 14px; border-radius: 20px; backdrop-filter: blur(8px); }

  /* SHEETS */
  .map-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 400; display: flex; align-items: flex-end; }
  .map-sheet { width: 100%; background: #181818; border-radius: 22px 22px 0 0; padding: 14px 22px 50px; animation: sheetUp 0.22s cubic-bezier(0.34,1.3,0.64,1); }
  @keyframes sheetUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
  .sheet-handle { width: 38px; height: 4px; background: #333; border-radius: 2px; margin: 0 auto 18px; }
  .sheet-title { font-family: 'Inconsolata', monospace; font-size: 12px; color: rgba(255,255,255,0.35); letter-spacing: 2px; text-align: center; margin-bottom: 16px; }
  .status-row { display: flex; gap: 12px; }
  .status-btn { flex: 1; padding: 16px 6px; border-radius: 14px; border: 2px solid; background: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 7px; transition: transform 0.1s; }
  .status-btn:active { transform: scale(0.94); }
  .status-emoji { font-size: 26px; line-height: 1; }
  .status-label { font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 700; }
  .del-btn { width: 100%; margin-top: 12px; padding: 13px; background: none; border: 1.5px solid #2a2a2a; border-radius: 12px; color: #555; font-family: 'Inconsolata', monospace; font-size: 13px; letter-spacing: 0.5px; cursor: pointer; transition: all 0.15s; }
  .del-btn:hover { border-color: #f43f5e; color: #f43f5e; }

  .no-gps-title { font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 800; color: #fff; margin-bottom: 8px; }
  .no-gps-sub { font-family: 'Inconsolata', monospace; font-size: 13px; color: rgba(255,255,255,0.4); line-height: 1.6; margin-bottom: 16px; }
  .addr-input { width: 100%; background: #111; border: 1.5px solid #2a2a2a; border-radius: 12px; padding: 13px 14px; color: #fff; font-family: 'Inconsolata', monospace; font-size: 14px; outline: none; margin-bottom: 12px; transition: border-color 0.2s; }
  .addr-input:focus { border-color: #f59e0b; }
  .addr-input::placeholder { color: #3a3a3a; }
  .primary-btn { width: 100%; padding: 14px; background: #f59e0b; color: #0f0f0f; border: none; border-radius: 12px; font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 800; cursor: pointer; transition: opacity 0.15s; }
  .primary-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .cancel-btn { width: 100%; padding: 11px; background: none; border: none; color: rgba(255,255,255,0.25); font-family: 'Inconsolata', monospace; font-size: 13px; cursor: pointer; margin-top: 8px; }

  /* TOAST */
  .toast { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: #1e1e1e; border: 1px solid #333; color: #fff; padding: 10px 20px; border-radius: 20px; font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 0.5px; z-index: 999; white-space: nowrap; animation: toastIn 0.18s ease; }
  @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// PROFIT CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════════

function ProfitCalc({ avgSold, amazonPrice, shipping }) {
  const [cost, setCost] = useState("");
  const [platform, setPlatform] = useState("ebay");
  const [overrideShipping, setOverrideShipping] = useState("");

  const sellPrice = platform === "ebay" ? avgSold : amazonPrice;
  const feeRate = platform === "ebay" ? 0.1325 : 0.15;
  const shippingCost = overrideShipping !== ""
    ? parseFloat(overrideShipping) || 0
    : platform === "ebay" ? (shipping?.estimatedCost ?? 5.50) : 0;

  const fees = sellPrice ? +(sellPrice * feeRate).toFixed(2) : 0;
  const net = sellPrice ? +(sellPrice - fees - shippingCost - (parseFloat(cost) || 0)).toFixed(2) : 0;
  const roi = cost && parseFloat(cost) > 0 && sellPrice ? +((net / parseFloat(cost)) * 100).toFixed(0) : null;

  return (
    <div className="profit-card">
      {platform === "ebay" && shipping && (
        <div style={{ background:"rgba(0,229,160,0.06)", border:"1px solid rgba(0,229,160,0.2)", borderRadius:10, padding:"10px 14px", marginBottom:16, display:"flex", alignItems:"flex-start", gap:10 }}>
          <span style={{ fontSize:16 }}>📦</span>
          <div>
            <div style={{ fontSize:11, color:"var(--accent)", fontFamily:"'DM Mono',monospace", letterSpacing:1, marginBottom:3 }}>EBAY SHIPPING ESTIMATE</div>
            <div style={{ fontSize:13, color:"var(--text)" }}><strong>${(shipping.estimatedCost??5.50).toFixed(2)}</strong>{" · "}{shipping.carrier}{" · "}{shipping.packageType}{" · "}{shipping.weightEstimate}</div>
            {shipping.note && <div style={{ fontSize:11, color:"var(--muted)", marginTop:3 }}>{shipping.note}</div>}
          </div>
        </div>
      )}

      <div className="calc-input-row">
        <div className="calc-field">
          <div className="option-label">YOUR COST $</div>
          <input className="option-input" type="number" placeholder="0.00" value={cost} onChange={e => setCost(e.target.value)} />
        </div>
        <div className="calc-field">
          <div className="option-label">SELL ON</div>
          <select className="option-input" value={platform} onChange={e => setPlatform(e.target.value)}>
            <option value="ebay">eBay</option>
            <option value="amazon">Amazon (FBA)</option>
          </select>
        </div>
        <div className="calc-field">
          <div className="option-label">OVERRIDE SHIPPING $</div>
          <input className="option-input" type="number" placeholder={platform==="ebay" ? `${(shipping?.estimatedCost??5.50).toFixed(2)} (est)` : "0.00"} value={overrideShipping} onChange={e => setOverrideShipping(e.target.value)} />
        </div>
      </div>

      {sellPrice ? (
        <>
          <div className="profit-row"><span className="profit-row-label">Sale Price (avg sold)</span><span className="profit-row-value profit-neutral">${sellPrice.toFixed(2)}</span></div>
          <div className="profit-row"><span className="profit-row-label">Platform Fees ({(feeRate*100).toFixed(2)}%)</span><span className="profit-row-value profit-negative">−${fees}</span></div>
          <div className="profit-row">
            <span className="profit-row-label">Shipping to Buyer{overrideShipping===""&&platform==="ebay"&&<span style={{fontSize:10,color:"var(--accent)",marginLeft:5}}>eBay est.</span>}</span>
            <span className="profit-row-value profit-negative">−${shippingCost.toFixed(2)}</span>
          </div>
          {cost && parseFloat(cost) > 0 && <div className="profit-row"><span className="profit-row-label">Your Purchase Cost</span><span className="profit-row-value profit-negative">−${parseFloat(cost).toFixed(2)}</span></div>}
          <div className="profit-total">
            <span className="profit-total-label">NET PROFIT</span>
            <span className={`profit-total-value ${net>=0?"profit-positive":"profit-negative"}`}>
              {net>=0?"+":""}${net.toFixed(2)}
              {roi!==null && <span style={{fontSize:14,marginLeft:8,color:roi>=30?"var(--ebay-green)":roi>=0?"var(--warn)":"var(--danger)"}}>({roi}% ROI)</span>}
            </span>
          </div>
          {roi !== null && (
            <div style={{ marginTop:14, paddingTop:12, borderTop:"1px solid var(--border)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'DM Mono',monospace" }}>ROI METER</span>
                <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'DM Mono',monospace" }}>{roi<0?"💸 losing":roi<20?"😐 thin":roi<50?"👍 decent":"🔥 great flip"}</span>
              </div>
              <div style={{ background:"var(--border)", borderRadius:4, height:5, overflow:"hidden" }}>
                <div style={{ width:`${Math.min(Math.max(roi,0),100)}%`, height:"100%", background:roi<20?"var(--danger)":roi<50?"var(--warn)":"var(--ebay-green)", borderRadius:4, transition:"width 0.4s ease" }}/>
              </div>
            </div>
          )}
        </>
      ) : (
        <p style={{ color:"var(--muted)", fontSize:13, textAlign:"center" }}>No price data for this platform</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLIPSCOUT TAB
// ═══════════════════════════════════════════════════════════════════════════════

function FlipScout() {
  const [inputTab, setInputTab] = useState("photo");
  const [description, setDescription] = useState("");
  const [imageData, setImageData] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => { setImagePreview(e.target.result); setImageData(e.target.result.split(",")[1]); };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };

  const doResearch = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      let itemDescription = description;
      if (inputTab === "photo" && imageData) {
        setLoadingStep("🔍 Identifying item from photo...");
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1000, messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageData } },
            { type: "text", text: "Identify this item for resale research. Provide a specific, searchable description including brand, model, item type, condition if visible, and notable features. Be specific — include model numbers if visible. Format: just the description, no extra text." }
          ]}]})
        });
        const d = await r.json();
        itemDescription = d.content?.find(b => b.type === "text")?.text || "Unknown item";
      }

      setLoadingStep("📦 Searching eBay sold listings...");
      await new Promise(r => setTimeout(r, 500));
      setLoadingStep("🛒 Checking Amazon pricing...");
      await new Promise(r => setTimeout(r, 500));
      setLoadingStep("📊 Analyzing profit potential...");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL, max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: `You are a resale market research expert. Research this item and return ONLY a valid JSON object (no markdown, no explanation):

ITEM: "${itemDescription}"

Search for:
1. eBay SOLD listings (not active) — find real recent sold prices
2. Amazon current price

Return this exact JSON structure:
{
  "itemName": "clean product name",
  "itemSummary": "brief 1-sentence description",
  "ebay": {
    "avgSoldPrice": number or null,
    "soldCount": number,
    "lowSold": number or null,
    "highSold": number or null,
    "recentSales": [
      { "title": "listing title", "price": number, "date": "Mon YYYY", "condition": "Used/New/etc" }
    ]
  },
  "amazon": {
    "currentPrice": number or null,
    "priceRange": "low-high string or null",
    "condition": "New/Used/Both",
    "note": "brief note about Amazon listings"
  },
  "shipping": {
    "estimatedCost": number,
    "carrier": "USPS / UPS / FedEx / etc",
    "packageType": "Poly Mailer / Small Box / Medium Box / Large Box / Freight",
    "weightEstimate": "e.g. 1-2 lbs",
    "note": "brief reason based on what eBay sellers actually charged"
  },
  "verdict": {
    "rating": "BUY" | "MAYBE" | "PASS",
    "reason": "2-3 sentence explanation factoring in realistic shipping cost."
  }
}

SHIPPING GUIDANCE: Look at what actual eBay sold listings charged. Small/light under 1lb: USPS First Class ~$4-6. Medium 1-5lbs: USPS Priority ~$8-14. Heavy/large: UPS Ground ~$15-30. If most had free shipping set estimatedCost to 0.

Use real web search data. If you can't find sold data, use null. Be honest.` }]
        })
      });

      const data = await res.json();
      const fullText = data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      const parsed = parseResearch(fullText);
      if (!parsed) throw new Error("Couldn't parse research data. Try a more specific description.");
      parsed._rawDescription = itemDescription;
      setResult(parsed);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false); setLoadingStep("");
    }
  };

  const reset = () => { setResult(null); setError(null); setImageData(null); setImagePreview(null); setDescription(""); };
  const canSearch = (inputTab === "photo" && imageData) || (inputTab === "text" && description.trim().length > 3);

  const verdictConfig = {
    BUY:   { cls: "verdict-buy",   icon: "💰", label: "BUY IT" },
    MAYBE: { cls: "verdict-maybe", icon: "🤔", label: "MAYBE — DO THE MATH" },
    PASS:  { cls: "verdict-pass",  icon: "🚫", label: "PASS ON IT" },
  };

  return (
    <div className="page scout">
      <div className="scout-header">
        <div className="logo">
          <span className="logo-flip">Flip</span>
          <span className="logo-scout">Scout</span>
          <span className="logo-tag">by shannon</span>
        </div>
        <div className="header-pills">
          <span className="pill pill-ebay">● eBay Sold</span>
          <span className="pill pill-amazon">● Amazon</span>
        </div>
      </div>

      <div className="scout-main">
        {!result && !loading && (
          <div className="input-card">
            <div className="input-tab-bar">
              <button className={`input-tab ${inputTab==="photo"?"active":""}`} onClick={() => setInputTab("photo")}>📷 Scan a Photo</button>
              <button className={`input-tab ${inputTab==="text"?"active":""}`} onClick={() => setInputTab("text")}>✏️ Describe It</button>
            </div>
            <div className="input-body">
              {inputTab === "photo" ? (
                imagePreview ? (
                  <>
                    <img src={imagePreview} alt="Preview" className="preview-img" />
                    <button className="reset-btn" onClick={() => { setImageData(null); setImagePreview(null); }}>× Remove photo</button>
                  </>
                ) : (
                  <div className={`drop-zone ${dragOver?"drag-over":""}`} onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop}>
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={e=>handleFile(e.target.files[0])} />
                    <span className="drop-icon">📸</span>
                    <div className="drop-label">Tap to take a photo or upload</div>
                    <div className="drop-sub">JPG, PNG, HEIC — drag & drop works too</div>
                  </div>
                )
              ) : (
                <textarea className="desc-textarea" rows={4} placeholder="e.g. Cuisinart 14-cup food processor DFP-14BCWX, used, no scratches…" value={description} onChange={e=>setDescription(e.target.value)} />
              )}
              <button className="search-btn" onClick={doResearch} disabled={!canSearch}>🔍 RESEARCH THIS ITEM</button>
            </div>
          </div>
        )}

        {loading && <div className="loading-wrap"><div className="spinner"/><div className="loading-step">{loadingStep}</div></div>}

        {error && <><div className="error-card">⚠️ {error}</div><br/><button className="reset-btn" onClick={reset}>← Try again</button></>}

        {result && (
          <div className="results">
            <div className="item-banner">
              <div className="item-name">{result.itemName}</div>
              <div className="item-condition">{result.itemSummary}</div>
            </div>

            {result.verdict && (() => {
              const v = verdictConfig[result.verdict.rating] || verdictConfig.MAYBE;
              return (
                <div className={`verdict-card ${v.cls}`}>
                  <div className="verdict-icon">{v.icon}</div>
                  <div><div className="verdict-label">{v.label}</div><div className="verdict-reason">{result.verdict.reason}</div></div>
                </div>
              );
            })()}

            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-source ebay">◆ EBAY SOLD AVG</div>
                <div className="metric-value" style={{color:"var(--ebay-green)"}}>{result.ebay?.avgSoldPrice ? `$${result.ebay.avgSoldPrice.toFixed(0)}` : "N/A"}</div>
                <div className="metric-label">average recent sale</div>
                {result.ebay?.lowSold && result.ebay?.highSold && <div className="metric-sub">Range: ${result.ebay.lowSold}–${result.ebay.highSold}</div>}
              </div>
              <div className="metric-card">
                <div className="metric-source ebay">◆ EBAY SOLD COUNT</div>
                <div className="metric-value" style={{color:"var(--accent)"}}>{result.ebay?.soldCount ?? "—"}</div>
                <div className="metric-label">recent sold listings</div>
                <div className="metric-sub">completed sales only</div>
              </div>
              <div className="metric-card">
                <div className="metric-source amazon">◆ AMAZON PRICE</div>
                <div className="metric-value" style={{color:"var(--amazon-orange)"}}>{result.amazon?.currentPrice ? `$${result.amazon.currentPrice.toFixed(0)}` : "N/A"}</div>
                <div className="metric-label">{result.amazon?.condition || "current"}</div>
                {result.amazon?.note && <div className="metric-sub">{result.amazon.note}</div>}
              </div>
            </div>

            {result.ebay?.recentSales?.length > 0 && (
              <div>
                <div className="section-title">RECENT EBAY SOLD <span className="badge badge-count">{result.ebay.recentSales.length} sales</span></div>
                <div className="sold-list">
                  {result.ebay.recentSales.map((s,i) => (
                    <div className="sold-row" key={i}>
                      <div className="sold-title">{s.title}</div>
                      <div className="sold-condition">{s.condition}</div>
                      <div className="sold-date">{s.date}</div>
                      <div className="sold-price">${typeof s.price==="number" ? s.price.toFixed(2) : s.price}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="section-title">PROFIT CALCULATOR</div>
              <ProfitCalc avgSold={result.ebay?.avgSoldPrice} amazonPrice={result.amazon?.currentPrice} shipping={result.shipping} />
            </div>

            <button className="reset-btn" onClick={reset}>← Research another item</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SALEMAP TAB
// ═══════════════════════════════════════════════════════════════════════════════

function SaleMap() {
  const [pins, setPins]           = useState(loadPins);
  const [userPos, setUserPos]     = useState(null);
  const [gpsReady, setGpsReady]   = useState(false);
  const [sheet, setSheet]         = useState(null);
  const [editPin, setEditPin]     = useState(null);
  const [pendingPos, setPending]  = useState(null);
  const [manualAddr, setManual]   = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [toast, setToast]         = useState(null);
  const [mapSize, setMapSize]     = useState({ w: 390, h: 600 });
  const mapRef  = useRef(null);
  const watchId = useRef(null);

  useEffect(() => savePins(pins), [pins]);

  useEffect(() => {
    const m = () => mapRef.current && setMapSize({ w: mapRef.current.offsetWidth, h: mapRef.current.offsetHeight });
    m();
    window.addEventListener("resize", m);
    return () => window.removeEventListener("resize", m);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(
      p => { setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setGpsReady(true); },
      () => setGpsReady(false),
      { enableHighAccuracy: true, maximumAge: 4000 }
    );
    return () => navigator.geolocation.clearWatch(watchId.current);
  }, []);

  const toast_ = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const handleMark = () => {
    if (gpsReady && userPos) { setPending(userPos); setSheet("new"); }
    else setSheet("noGps");
  };

  const confirmPin = (status) => {
    if (!pendingPos) return;
    setPins(p => [...p, { id: Date.now(), ...pendingPos, status }]);
    setSheet(null); setPending(null);
    toast_(`${MAP_STATUS[status].emoji} Marked as ${MAP_STATUS[status].label}`);
  };

  const geocodeManual = async () => {
    if (!manualAddr.trim()) return;
    setGeocoding(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(manualAddr)}&format=json&limit=1`);
      const d = await r.json();
      if (d[0]) { setPending({ lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }); setManual(""); setSheet("new"); }
      else toast_("⚠️ Address not found");
    } catch { toast_("⚠️ Geocoding failed"); }
    finally { setGeocoding(false); }
  };

  const updatePin = (id, status) => { setPins(p => p.map(x => x.id===id ? {...x,status} : x)); setSheet(null); setEditPin(null); toast_(`${MAP_STATUS[status].emoji} Updated`); };
  const deletePin = (id)         => { setPins(p => p.filter(x => x.id!==id)); setSheet(null); setEditPin(null); toast_("Pin removed"); };
  const clearAll  = ()           => { if (pins.length && window.confirm(`Clear all ${pins.length} pins?`)) { setPins([]); toast_("Map cleared"); } };

  const allLats = [...pins.map(p=>p.lat), userPos?.lat].filter(Boolean);
  const allLngs = [...pins.map(p=>p.lng), userPos?.lng].filter(Boolean);
  const pad = 0.003;
  const bounds = allLats.length ? {
    minLat: Math.min(...allLats)-pad, maxLat: Math.max(...allLats)+pad,
    minLng: Math.min(...allLngs)-pad, maxLng: Math.max(...allLngs)+pad,
  } : null;

  const mapSrc = bounds
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}&layer=mapnik`
    : `https://www.openstreetmap.org/export/embed.html?bbox=-86.85,33.35,-86.65,33.55&layer=mapnik`;

  const counts = { visited: pins.filter(p=>p.status==="visited").length, skip: pins.filter(p=>p.status==="skip").length, return: pins.filter(p=>p.status==="return").length };

  return (
    <div className="page map" style={{ background:"#111" }}>
      <div className="map-header">
        <div className="map-logo"><span className="map-logo-sale">Sale</span><span className="map-logo-map">Map</span></div>
        <div className="map-stats">
          <div className="map-stat"><div className="map-stat-num green">{counts.visited}</div><div className="map-stat-label">VISITED</div></div>
          <div className="map-stat"><div className="map-stat-num gray">{counts.skip}</div><div className="map-stat-label">SKIP</div></div>
          <div className="map-stat"><div className="map-stat-num red">{counts.return}</div><div className="map-stat-label">RETURN</div></div>
          <div className="map-stat"><div className="map-stat-num">{pins.length}</div><div className="map-stat-label">TOTAL</div></div>
        </div>
      </div>

      <div className="map-container" ref={mapRef}>
        <iframe key={mapSrc} className="map-iframe" src={mapSrc} title="SaleMap" scrolling="no" />

        {bounds && (
          <svg className="pin-overlay" viewBox={`0 0 ${mapSize.w} ${mapSize.h}`}>
            {userPos && (() => {
              const {x,y} = projectPin(userPos.lat, userPos.lng, bounds, mapSize.w, mapSize.h);
              return <g><circle cx={x} cy={y} r={13} fill="rgba(59,130,246,0.18)"/><circle cx={x} cy={y} r={6} fill="#3b82f6" stroke="#fff" strokeWidth="2"/></g>;
            })()}
            {pins.map(pin => {
              const {x,y} = projectPin(pin.lat, pin.lng, bounds, mapSize.w, mapSize.h);
              const col = MAP_STATUS[pin.status]?.color ?? "#f59e0b";
              return (
                <g key={pin.id} style={{pointerEvents:"all",cursor:"pointer"}} onClick={() => { setEditPin(pin); setSheet("edit"); }}>
                  <ellipse cx={x} cy={y+17} rx={5} ry={2.5} fill="rgba(0,0,0,0.28)"/>
                  <path d={`M${x},${y+17} C${x-5},${y+9} ${x-11},${y} ${x-11},${y-9} A11,11 0 1,1 ${x+11},${y-9} C${x+11},${y} ${x+5},${y+9} ${x},${y+17}Z`} fill={col} stroke="#fff" strokeWidth="1.8"/>
                  <text x={x} y={y-6} textAnchor="middle" dominantBaseline="middle" fontSize="11">{MAP_STATUS[pin.status]?.emoji ?? "📍"}</text>
                </g>
              );
            })}
          </svg>
        )}

        <div className="map-legend">
          {Object.entries(MAP_STATUS).map(([k,v]) => (
            <div className="legend-item" key={k}><div className="legend-dot" style={{background:v.color}}/>{v.label}</div>
          ))}
        </div>

        {pins.length > 0 && <button className="map-clear-btn" onClick={clearAll}>Clear all</button>}

        <div className="gps-badge"><div className={`gps-dot ${gpsReady?"on":""}`}/>{gpsReady?"GPS ready":"No GPS"}</div>

        <div className="mark-btn-wrap">
          <button className="mark-btn" onClick={handleMark}>
            <span className="mark-btn-icon">📍</span>
            <span className="mark-btn-label">MARK</span>
          </button>
          <span className="mark-hint">{gpsReady?"Tap to mark this house":"Tap to enter address"}</span>
        </div>
      </div>

      {sheet === "new" && (
        <div className="map-backdrop" onClick={e=>e.target===e.currentTarget&&setSheet(null)}>
          <div className="map-sheet">
            <div className="sheet-handle"/>
            <div className="sheet-title">WHAT IS THIS STOP?</div>
            <div className="status-row">
              {Object.entries(MAP_STATUS).map(([k,v]) => (
                <button key={k} className="status-btn" style={{borderColor:v.color,color:v.color}} onClick={()=>confirmPin(k)}>
                  <span className="status-emoji">{v.emoji}</span><span className="status-label">{v.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {sheet === "edit" && editPin && (
        <div className="map-backdrop" onClick={e=>e.target===e.currentTarget&&setSheet(null)}>
          <div className="map-sheet">
            <div className="sheet-handle"/>
            <div className="sheet-title">CHANGE STATUS</div>
            <div className="status-row">
              {Object.entries(MAP_STATUS).map(([k,v]) => (
                <button key={k} className="status-btn" style={{borderColor:v.color,color:v.color,background:editPin.status===k?v.color+"22":"none"}} onClick={()=>updatePin(editPin.id,k)}>
                  <span className="status-emoji">{v.emoji}</span><span className="status-label">{v.label}</span>
                </button>
              ))}
            </div>
            <button className="del-btn" onClick={()=>deletePin(editPin.id)}>🗑 Remove this pin</button>
          </div>
        </div>
      )}

      {sheet === "noGps" && (
        <div className="map-backdrop" onClick={e=>e.target===e.currentTarget&&setSheet(null)}>
          <div className="map-sheet">
            <div className="sheet-handle"/>
            <div className="no-gps-title">GPS not available</div>
            <div className="no-gps-sub">Enable location in your browser settings, or type an address to drop a pin manually.</div>
            <input className="addr-input" placeholder="123 Oak St, Birmingham AL" value={manualAddr} onChange={e=>setManual(e.target.value)} onKeyDown={e=>e.key==="Enter"&&geocodeManual()} autoFocus />
            <button className="primary-btn" onClick={geocodeManual} disabled={geocoding||!manualAddr.trim()}>{geocoding?"Finding…":"Drop Pin Here"}</button>
            <button className="cancel-btn" onClick={()=>setSheet(null)}>Cancel</button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP — TAB SHELL
// ═══════════════════════════════════════════════════════════════════════════════

export default function App() {
  const [activeTab, setActiveTab] = useState("scout");

  return (
    <>
      <style>{STYLES}</style>
      <div className="shell">
        {/* PAGE CONTENT */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {activeTab === "scout" && <FlipScout />}
          {activeTab === "map"   && <SaleMap />}
        </div>

        {/* BOTTOM NAV */}
        <nav className="bottom-nav">
          <button className={`nav-btn ${activeTab==="scout"?"active":""}`} onClick={() => setActiveTab("scout")}>
            <span className="nav-icon">🔍</span>
            <span className="nav-label">FLIPSCOUT</span>
          </button>
          <button className={`nav-btn map-tab ${activeTab==="map"?"active":""}`} onClick={() => setActiveTab("map")}>
            <span className="nav-icon">🗺️</span>
            <span className="nav-label">SALEMAP</span>
          </button>
        </nav>
      </div>
    </>
  );
}
