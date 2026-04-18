
import React, { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE — replace YOUR_SUPABASE_ANON_KEY with your actual key
// ═══════════════════════════════════════════════════════════════════════════════
const SUPABASE_URL = "https://wiwftjtaclrwdxgcrffk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpd2Z0anRhY2xyd2R4Z2NyZmZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjIyNTYsImV4cCI6MjA5MDI5ODI1Nn0.EKQL7I62SCPnOPcOI__0yeFDgruPuDbu3xEl_138iZU";

// Run this SQL once in Supabase:
// create table if not exists hunt_stops (
//   id uuid primary key default gen_random_uuid(),
//   session_date text not null,
//   name text not null,
//   address text not null,
//   lat numeric, lng numeric,
//   type text default 'garage',
//   notes text default '',
//   status text default 'pending',
//   est_minutes integer default 20,
//   open_time text default null,
//   close_time text default null,
//   sort_order integer default 0,
//   created_at timestamptz default now()
// );

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...opts.headers,
    },
    ...opts,
  });
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function geocode(address) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`,
      { headers: { "Accept-Language": "en", "User-Agent": "FlipScout/1.0" } }
    );
    const d = await r.json();
    if (d[0]) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
  } catch {}
  return null;
}

function getTodayKey() { return new Date().toISOString().slice(0, 10); }

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
const STOP_TYPES = {
  estate:    { label: "Estate Sale",    emoji: "🏛",  color: "#a78bfa" },
  garage:    { label: "Garage Sale",    emoji: "🏠",  color: "#f59e0b" },
  yard:      { label: "Yard Sale",      emoji: "🌿",  color: "#34d399" },
  community: { label: "Community Sale", emoji: "🏘",  color: "#60a5fa" },
  lunch:     { label: "Lunch Break",    emoji: "🍔",  color: "#f87171" },
};

const STOP_STATUS = {
  pending: { label: "Not Yet", color: "#f59e0b", emoji: "📍" },
  visited: { label: "Visited", color: "#22c55e", emoji: "✅" },
  skip:    { label: "Skip",    color: "#6b7280", emoji: "⏭"  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TIME HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minsToTime(m) {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return `${hh}:${min.toString().padStart(2, "0")} ${ampm}`;
}

function buildSchedule(stops, startTime, defaultMins) {
  let cursor = timeToMins(startTime) || timeToMins("08:00");
  return stops.map((stop, i) => {
    const arriveAt = cursor;
    const dur = stop.est_minutes || defaultMins || 20;
    cursor += dur + (i < stops.length - 1 ? 5 : 0);
    return { ...stop, arriveAt, leaveAt: arriveAt + dur };
  });
}

function getNowMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function projectPin(lat, lng, bounds, w, h) {
  const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * w;
  const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * h;
  return { x, y };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; background: #0c0c10; }
  body { font-family: 'DM Sans', sans-serif; color: #e8e8f0; -webkit-tap-highlight-color: transparent; }

  :root {
    --bg: #0c0c10; --surface: #13131a; --surface2: #1a1a24; --border: #252535;
    --accent: #f59e0b; --text: #e8e8f0; --muted: #60607a; --green: #22c55e; --red: #f43f5e;
  }

  .shell { height: 100vh; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; max-width: 520px; margin: 0 auto; }

  .app-header { background: var(--bg); border-bottom: 1px solid var(--border); padding: 13px 18px 11px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .app-logo { font-family: 'Bebas Neue', sans-serif; font-size: 24px; letter-spacing: 3px; line-height: 1; color: var(--text); }
  .app-logo span { color: var(--accent); }
  .header-right { display: flex; align-items: center; gap: 10px; }
  .sync-dot { width: 7px; height: 7px; border-radius: 50%; background: #6b7280; flex-shrink: 0; }
  .sync-dot.live { background: #22c55e; animation: syncPulse 2s ease-in-out infinite; }
  @keyframes syncPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .date-badge { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--muted); }

  .bottom-nav { display: flex; background: #0a0a0e; border-top: 1px solid var(--border); flex-shrink: 0; z-index: 200; }
  .nav-btn { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; padding: 10px 0 16px; background: none; border: none; cursor: pointer; color: var(--muted); transition: color 0.15s; }
  .nav-btn.active { color: var(--accent); }
  .nav-btn.map-active { color: #60a5fa; }
  .nav-icon { font-size: 20px; line-height: 1; }
  .nav-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1px; }

  .page { flex: 1; overflow-y: auto; min-height: 0; }
  .page.map-page { overflow: hidden; display: flex; flex-direction: column; }
  .plan-wrap { padding: 14px 14px 80px; display: flex; flex-direction: column; gap: 12px; }

  /* STATS */
  .stats-row { display: flex; gap: 8px; }
  .stat-chip { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 6px; text-align: center; }
  .stat-num { font-family: 'Bebas Neue', sans-serif; font-size: 26px; line-height: 1; color: var(--text); }
  .stat-num.amber { color: var(--accent); }
  .stat-num.green { color: var(--green); }
  .stat-num.gray  { color: #6b7280; }
  .stat-lbl { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--muted); letter-spacing: 1px; margin-top: 2px; }

  /* SCHEDULE CARD */
  .section-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px; }
  .section-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; color: var(--muted); margin-bottom: 12px; }
  .settings-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .settings-field { flex: 1; min-width: 90px; }
  .field-label { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); letter-spacing: 0.5px; margin-bottom: 4px; }
  .field-input { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; color: var(--text); font-family: 'DM Mono', monospace; font-size: 12px; outline: none; transition: border-color 0.2s; }
  .field-input:focus { border-color: var(--accent); }
  .mins-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .mins-chip { padding: 5px 11px; border-radius: 20px; border: 1px solid var(--border); background: none; color: var(--muted); font-family: 'DM Mono', monospace; font-size: 11px; cursor: pointer; transition: all 0.15s; }
  .mins-chip.active { background: var(--accent); color: #0c0c10; border-color: var(--accent); font-weight: 600; }

  /* DAY STATUS */
  .day-status { display: flex; align-items: center; gap: 8px; padding: 9px 13px; border-radius: 9px; font-family: 'DM Mono', monospace; font-size: 11px; margin-top: 10px; letter-spacing: 0.3px; }
  .day-status.ahead   { background: rgba(34,197,94,0.1);  color: var(--green); border: 1px solid rgba(34,197,94,0.2); }
  .day-status.behind  { background: rgba(244,63,94,0.1);  color: var(--red);   border: 1px solid rgba(244,63,94,0.2); }
  .day-status.ontrack { background: rgba(245,158,11,0.1); color: var(--accent);border: 1px solid rgba(245,158,11,0.2); }

  /* TIMELINE */
  .timeline { display: flex; flex-direction: column; margin-top: 14px; }
  .tl-row { display: flex; align-items: flex-start; position: relative; }
  .tl-time { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--muted); text-align: right; padding-right: 10px; width: 54px; flex-shrink: 0; padding-top: 1px; line-height: 1.4; }
  .tl-time.now { color: var(--accent); font-weight: 600; }
  .tl-spine { width: 22px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; position: relative; }
  .tl-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 2px; z-index: 1; flex-shrink: 0; }
  .tl-line { position: absolute; top: 12px; bottom: -4px; width: 2px; background: var(--border); }
  .tl-content { flex: 1; padding-bottom: 14px; padding-left: 4px; }
  .tl-name { font-size: 13px; font-weight: 600; color: var(--text); line-height: 1.3; }
  .tl-name.is-now { color: var(--accent); }
  .tl-meta { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); margin-top: 2px; display: flex; gap: 8px; flex-wrap: wrap; }
  .tl-warn { color: var(--red); }
  .tl-end { display: flex; align-items: center; gap: 0; padding-top: 2px; }
  .tl-end-time { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--muted); text-align: right; padding-right: 10px; width: 54px; flex-shrink: 0; }
  .tl-end-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border); border: 2px solid #3a3a4a; flex-shrink: 0; margin-left: 6px; }
  .tl-end-label { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); padding-left: 8px; }

  /* ADD STOP */
  .add-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px; }
  .type-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .type-chip { padding: 5px 10px; border-radius: 8px; border: 1px solid var(--border); background: none; font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .type-chip.active { color: #0c0c10; border-color: transparent; font-weight: 600; }
  .add-input { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 9px; padding: 10px 13px; color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 13px; outline: none; transition: border-color 0.2s; margin-bottom: 7px; }
  .add-input:focus { border-color: var(--accent); }
  .add-input::placeholder { color: var(--muted); }
  .hours-row { display: flex; gap: 8px; margin-bottom: 7px; }
  .hours-field { flex: 1; }
  .add-actions { display: flex; gap: 8px; }
  .add-btn { flex: 1; padding: 11px; background: var(--accent); color: #0c0c10; border: none; border-radius: 9px; font-family: 'Bebas Neue', sans-serif; font-size: 16px; letter-spacing: 2px; cursor: pointer; transition: all 0.15s; }
  .add-btn:hover:not(:disabled) { background: #fbbf24; }
  .add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .paste-btn { padding: 11px 14px; background: none; border: 1px solid var(--border); border-radius: 9px; color: var(--muted); font-family: 'DM Mono', monospace; font-size: 11px; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .paste-btn:hover { color: var(--text); border-color: var(--text); }

  /* STOPS LIST */
  .stops-header { display: flex; align-items: center; justify-content: space-between; padding: 0 2px; }
  .stops-header-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; color: var(--muted); }
  .clear-all-btn { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); background: none; border: none; cursor: pointer; letter-spacing: 0.5px; transition: color 0.15s; padding: 0; }
  .clear-all-btn:hover { color: var(--red); }

  .stop-card { background: var(--surface); border: 1px solid var(--border); border-radius: 13px; overflow: hidden; transition: border-color 0.15s; }
  .stop-card.visited { border-color: rgba(34,197,94,0.35); }
  .stop-card.skip    { opacity: 0.55; }
  .stop-main { padding: 12px 13px; display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
  .stop-emoji { font-size: 22px; flex-shrink: 0; line-height: 1.1; }
  .stop-info { flex: 1; min-width: 0; }
  .stop-name { font-size: 14px; font-weight: 600; color: var(--text); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stop-addr { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
  .stop-pills { display: flex; align-items: center; gap: 6px; margin-top: 5px; flex-wrap: wrap; }
  .pill { font-family: 'DM Mono', monospace; font-size: 10px; padding: 2px 8px; border-radius: 5px; }
  .pill-time   { color: var(--accent); background: rgba(245,158,11,0.12); }
  .pill-status { }
  .pill-hours  { color: #60a5fa; background: rgba(96,165,250,0.1); }
  .pill-warn   { color: var(--red); background: rgba(244,63,94,0.1); }
  .pill-note   { color: var(--muted); font-style: italic; font-family: 'DM Sans', sans-serif; }
  .stop-chevron { color: var(--muted); font-size: 16px; transition: transform 0.2s; flex-shrink: 0; margin-top: 3px; }
  .stop-chevron.open { transform: rotate(90deg); }

  .stop-expanded { border-top: 1px solid var(--border); padding: 12px 13px; background: rgba(0,0,0,0.25); display: flex; flex-direction: column; gap: 10px; }
  .status-btns { display: flex; gap: 8px; }
  .status-btn { flex: 1; padding: 10px 4px; border-radius: 10px; border: 1.5px solid; background: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.12s; }
  .status-btn:active { transform: scale(0.95); }
  .status-btn-emoji { font-size: 20px; line-height: 1; }
  .status-btn-label { font-family: 'DM Mono', monospace; font-size: 10px; }

  .expand-fields { display: flex; gap: 8px; flex-wrap: wrap; }
  .expand-field { flex: 1; min-width: 80px; }
  .stop-notes-input { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 9px 12px; color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 13px; outline: none; resize: none; transition: border-color 0.2s; }
  .stop-notes-input:focus { border-color: var(--accent); }
  .stop-notes-input::placeholder { color: var(--muted); }
  .stop-actions { display: flex; gap: 7px; }
  .s-btn { flex: 1; padding: 8px 4px; border-radius: 8px; border: 1px solid var(--border); background: none; color: var(--muted); font-family: 'DM Mono', monospace; font-size: 10px; cursor: pointer; transition: all 0.15s; text-align: center; }
  .s-btn:hover { color: var(--text); border-color: var(--text); }
  .s-btn.danger:hover { color: var(--red); border-color: var(--red); }
  .s-btn.nav-btn-s { background: rgba(96,165,250,0.1); color: #60a5fa; border-color: rgba(96,165,250,0.25); }

  /* EMPTY */
  .empty { text-align: center; padding: 40px 20px; color: var(--muted); }
  .empty-icon { font-size: 44px; margin-bottom: 12px; display: block; }
  .empty-text { font-size: 14px; line-height: 1.6; }

  /* MAP */
  .map-wrap { flex: 1; position: relative; overflow: hidden; min-height: 0; }
  .map-iframe { width: 100%; height: 100%; border: none; display: block; }
  .pin-svg { position: absolute; inset: 0; pointer-events: none; z-index: 10; }

  .map-legend { position: absolute; top: 12px; left: 12px; z-index: 100; background: rgba(10,10,14,0.92); border: 1px solid #2a2a3a; border-radius: 10px; padding: 8px 12px; backdrop-filter: blur(10px); display: flex; flex-direction: column; gap: 5px; }
  .legend-row { display: flex; align-items: center; gap: 7px; font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.6); }
  .legend-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }

  .map-clear-btn { position: absolute; top: 12px; right: 12px; z-index: 100; background: rgba(10,10,14,0.92); border: 1px solid #2a2a3a; border-radius: 8px; padding: 7px 12px; color: rgba(255,255,255,0.4); font-family: 'DM Mono', monospace; font-size: 10px; cursor: pointer; backdrop-filter: blur(10px); transition: all 0.15s; }
  .map-clear-btn:hover { color: var(--red); border-color: var(--red); }

  .gps-pill { position: absolute; bottom: 120px; right: 12px; z-index: 100; background: rgba(10,10,14,0.92); border: 1px solid #2a2a3a; border-radius: 20px; padding: 5px 12px; font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.4); backdrop-filter: blur(10px); display: flex; align-items: center; gap: 6px; }
  .gps-dot { width: 6px; height: 6px; border-radius: 50%; background: #6b7280; }
  .gps-dot.on { background: #22c55e; animation: gpsPulse 1.6s ease-in-out infinite; }
  @keyframes gpsPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

  .mark-wrap { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 100; display: flex; flex-direction: column; align-items: center; gap: 7px; }
  .mark-btn { width: 70px; height: 70px; border-radius: 50%; background: var(--accent); border: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; box-shadow: 0 6px 24px rgba(245,158,11,0.5); transition: transform 0.1s; }
  .mark-btn:active { transform: scale(0.92); }
  .mark-icon { font-size: 24px; line-height: 1; }
  .mark-label { font-family: 'DM Mono', monospace; font-size: 9px; font-weight: 600; color: #0c0c10; letter-spacing: 1px; }
  .mark-hint { font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.4); background: rgba(0,0,0,0.6); padding: 4px 12px; border-radius: 20px; backdrop-filter: blur(8px); }

  .map-strip { position: absolute; bottom: 0; left: 0; right: 0; z-index: 100; background: rgba(10,10,14,0.96); border-top: 1px solid #2a2a3a; padding: 10px 12px 16px; backdrop-filter: blur(12px); }
  .map-strip-label { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--muted); letter-spacing: 1.5px; margin-bottom: 8px; }
  .map-strip-list { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 2px; }
  .strip-stop { flex-shrink: 0; min-width: 110px; background: var(--surface); border: 1px solid var(--border); border-radius: 9px; padding: 7px 10px; cursor: pointer; transition: border-color 0.15s; }
  .strip-stop.is-now { border-color: var(--accent); }
  .strip-stop.is-done { opacity: 0.45; }
  .strip-name { font-size: 11px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px; }
  .strip-meta { display: flex; align-items: center; justify-content: space-between; }
  .strip-time { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--accent); }

  /* SHEETS */
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.72); z-index: 500; display: flex; align-items: flex-end; }
  .sheet { width: 100%; background: #161620; border-radius: 20px 20px 0 0; padding: 14px 20px 50px; animation: sheetUp 0.2s cubic-bezier(0.34,1.3,0.64,1); }
  @keyframes sheetUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
  .sheet-handle { width: 36px; height: 4px; background: #2a2a3a; border-radius: 2px; margin: 0 auto 16px; }
  .sheet-title { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--muted); letter-spacing: 2px; text-align: center; margin-bottom: 16px; }
  .sheet-status-row { display: flex; gap: 10px; }
  .sh-status-btn { flex: 1; padding: 14px 4px; border-radius: 12px; border: 2px solid; background: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 6px; transition: transform 0.1s; }
  .sh-status-btn:active { transform: scale(0.94); }
  .sh-status-emoji { font-size: 26px; line-height: 1; }
  .sh-status-label { font-family: 'DM Mono', monospace; font-size: 10px; }
  .sh-del-btn { width: 100%; margin-top: 12px; padding: 12px; background: none; border: 1px solid #2a2a3a; border-radius: 10px; color: #555; font-family: 'DM Mono', monospace; font-size: 12px; cursor: pointer; transition: all 0.15s; }
  .sh-del-btn:hover { border-color: var(--red); color: var(--red); }

  .no-gps-title { font-size: 17px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
  .no-gps-sub { font-family: 'DM Mono', monospace; font-size: 12px; color: var(--muted); line-height: 1.6; margin-bottom: 14px; }
  .addr-input { width: 100%; background: #0c0c10; border: 1.5px solid #2a2a3a; border-radius: 10px; padding: 12px 14px; color: var(--text); font-family: 'DM Mono', monospace; font-size: 13px; outline: none; margin-bottom: 10px; transition: border-color 0.2s; }
  .addr-input:focus { border-color: var(--accent); }
  .addr-input::placeholder { color: #333; }
  .primary-btn { width: 100%; padding: 13px; background: var(--accent); color: #0c0c10; border: none; border-radius: 10px; font-family: 'Bebas Neue', sans-serif; font-size: 17px; letter-spacing: 2px; cursor: pointer; }
  .primary-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .cancel-btn { width: 100%; padding: 10px; background: none; border: none; color: var(--muted); font-family: 'DM Mono', monospace; font-size: 12px; cursor: pointer; margin-top: 6px; }

  .paste-area { width: 100%; background: #0c0c10; border: 1.5px solid #2a2a3a; border-radius: 10px; padding: 12px 14px; color: var(--text); font-family: 'DM Mono', monospace; font-size: 12px; outline: none; resize: none; margin-bottom: 12px; transition: border-color 0.2s; line-height: 1.6; }
  .paste-area:focus { border-color: var(--accent); }
  .modal-actions { display: flex; gap: 10px; }
  .ghost-btn { padding: 13px 18px; background: none; border: 1px solid var(--border); border-radius: 10px; color: var(--muted); font-family: 'DM Mono', monospace; font-size: 12px; cursor: pointer; }

  .toast { position: fixed; bottom: 75px; left: 50%; transform: translateX(-50%); background: #1e1e2e; border: 1px solid #2a2a3a; color: var(--text); padding: 9px 18px; border-radius: 20px; font-family: 'DM Mono', monospace; font-size: 11px; z-index: 999; white-space: nowrap; animation: toastIn 0.18s ease; pointer-events: none; }
  @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// LEAFLET MAP COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
function LeafletMap({ userPos, gpsReady, stops, mapPins, nowMins, onMarkClick, onStopClick, onPinClick, onClearPins }) {
  const mapDivRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);

  // Init map once
  useEffect(() => {
    if (leafletRef.current || !mapDivRef.current) return;

    // Load Leaflet CSS
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
    }

    // Load Leaflet JS then init
    const initMap = () => {
      const L = window.L;
      if (!L || !mapDivRef.current) return;

      const center = userPos ? [userPos.lat, userPos.lng] : [33.4, -86.8];
      const map = L.map(mapDivRef.current, { zoomControl: true, attributionControl: false }).setView(center, 15);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      leafletRef.current = map;
    };

    if (window.L) {
      initMap();
    } else {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      script.onload = initMap;
      document.head.appendChild(script);
    }

    return () => {
      if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }
    };
  }, []);

  // Update user position marker
  useEffect(() => {
    const L = window.L;
    const map = leafletRef.current;
    if (!L || !map || !userPos) return;

    if (userMarkerRef.current) { userMarkerRef.current.setLatLng([userPos.lat, userPos.lng]); }
    else {
      const icon = L.divIcon({ html: '<div style="width:14px;height:14px;border-radius:50%;background:#60a5fa;border:2px solid #fff;box-shadow:0 0 6px rgba(96,165,250,0.6)"></div>', iconSize:[14,14], iconAnchor:[7,7], className:"" });
      userMarkerRef.current = L.marker([userPos.lat, userPos.lng], { icon }).addTo(map);
      map.setView([userPos.lat, userPos.lng], 16);
    }
  }, [userPos]);

  // Force map to recalculate size when it becomes visible
  useEffect(() => {
    if (leafletRef.current) {
      setTimeout(() => leafletRef.current.invalidateSize(), 100);
    }
  });

  // Update stop + pin markers
  useEffect(() => {
    const L = window.L;
    const map = leafletRef.current;
    if (!L || !map) return;

    // Clear old markers
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    // Add planned stop markers
    stops.filter(s => s.lat && s.lng).forEach(stop => {
      const st = STOP_TYPES[stop.type] || STOP_TYPES.garage;
      const ms = STOP_STATUS[stop.status] || STOP_STATUS.pending;
      const col = stop.status === "pending" ? st.color : ms.color;
      const icon = L.divIcon({
        html: `<div style="width:32px;height:36px;position:relative;cursor:pointer">
          <svg width="32" height="36" viewBox="0 0 32 36">
            <path d="M16,34 C11,26 4,22 4,14 A12,12 0 1,1 28,14 C28,22 21,26 16,34Z" fill="${col}" stroke="white" stroke-width="2"/>
            <text x="16" y="15" text-anchor="middle" dominant-baseline="middle" font-size="11">${st.emoji}</text>
          </svg>
        </div>`,
        iconSize: [32,36], iconAnchor: [16,34], className: ""
      });
      const marker = L.marker([stop.lat, stop.lng], { icon }).addTo(map);
      marker.on("click", () => onStopClick(stop));
      markersRef.current.push(marker);
    });

    // Add on-the-fly pin markers
    mapPins.forEach(pin => {
      const col = STOP_STATUS[pin.status]?.color ?? "#f59e0b";
      const emoji = STOP_STATUS[pin.status]?.emoji ?? "📍";
      const icon = L.divIcon({
        html: `<div style="width:26px;height:26px;border-radius:50%;background:${col};border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.4)">${emoji}</div>`,
        iconSize: [26,26], iconAnchor: [13,13], className: ""
      });
      const marker = L.marker([pin.lat, pin.lng], { icon }).addTo(map);
      marker.on("click", () => onPinClick(pin));
      markersRef.current.push(marker);
    });
  }, [stops, mapPins, onStopClick, onPinClick]);

  return (
    <div style={{ flex:1, position:"relative", overflow:"hidden", minHeight:0, display:"flex", flexDirection:"column" }}>
      <div ref={mapDivRef} style={{ flex:1, minHeight:0 }} />

      {/* Legend */}
      <div className="map-legend">
        {Object.entries(STOP_STATUS).map(([k,v]) => (
          <div className="legend-row" key={k}><div className="legend-dot" style={{background:v.color}}/>{v.label}</div>
        ))}
        <div style={{height:1,background:"#2a2a3a",margin:"3px 0"}}/>
        <div className="legend-row" style={{fontSize:9,color:"rgba(255,255,255,0.3)"}}>Pins = planned</div>
        <div className="legend-row" style={{fontSize:9,color:"rgba(255,255,255,0.3)"}}>Circles = on-the-fly</div>
      </div>

      {mapPins.length > 0 && (
        <button className="map-clear-btn" onClick={onClearPins}>Clear pins</button>
      )}

      <div className="gps-pill"><div className={`gps-dot ${gpsReady?"on":""}`}/>{gpsReady?"GPS ready":"No GPS"}</div>

      <div className="mark-wrap">
        <button className="mark-btn" onClick={onMarkClick}>
          <span className="mark-icon">📍</span>
          <span className="mark-label">MARK</span>
        </button>
        <span className="mark-hint">{gpsReady?"Tap to mark this house":"Tap to enter address"}</span>
      </div>

      {stops.length > 0 && (
        <div className="map-strip">
          <div className="map-strip-label">TODAY'S PLANNED STOPS</div>
          <div className="map-strip-list">
            {stops.map(stop => {
              const isNow = stop.arriveAt<=nowMins&&nowMins<stop.leaveAt;
              const isDone = stop.status==="visited"||stop.status==="skip";
              return (
                <div key={stop.id} className={`strip-stop ${isNow?"is-now":""} ${isDone?"is-done":""}`} onClick={() => onStopClick(stop)}>
                  <div className="strip-name">{STOP_TYPES[stop.type]?.emoji} {stop.name}</div>
                  <div className="strip-meta">
                    <span className="strip-time">{minsToTime(stop.arriveAt)}</span>
                    <span style={{fontSize:12}}>{STOP_STATUS[stop.status]?.emoji??"📍"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [activeTab, setActiveTab]     = useState("plan");
  const [stops, setStops]             = useState([]);
  const [sessionDate, setSessionDate] = useState(getTodayKey());
  const [startTime, setStartTime]     = useState("08:00");
  const [endTime, setEndTime]         = useState("14:00");
  const [defaultMins, setDefaultMins] = useState(20);
  const [connected, setConnected]     = useState(false);
  const [expandedId, setExpandedId]   = useState(null);
  const [toast, setToast]             = useState(null);
  const [newAddr, setNewAddr]         = useState("");
  const [newName, setNewName]         = useState("");
  const [newType, setNewType]         = useState("garage");
  const [newOpen, setNewOpen]         = useState("");
  const [newClose, setNewClose]       = useState("");
  const [adding, setAdding]           = useState(false);
  const [pasteModal, setPasteModal]   = useState(false);
  const [pasteText, setPasteText]     = useState("");
  const [pasting, setPasting]         = useState(false);
  const [userPos, setUserPos]         = useState(null);
  const [gpsReady, setGpsReady]       = useState(false);
  const [mapPins, setMapPins]         = useState([]);
  const [mapSheet, setMapSheet]       = useState(null);
  const [editPin, setEditPin]         = useState(null);
  const [pendingPos, setPending]      = useState(null);
  const [manualAddr, setManual]       = useState("");
  const [geocoding, setGeocoding]     = useState(false);

  const [nowMins, setNowMins]         = useState(getNowMins());

  const watchId  = useRef(null);
  const pollRef  = useRef(null);
  const clockRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2300); };

  // Clock
  useEffect(() => {
    clockRef.current = setInterval(() => setNowMins(getNowMins()), 60000);
    return () => clearInterval(clockRef.current);
  }, []);

  // Load stops
  const loadStops = useCallback(async () => {
    try {
      const data = await sbFetch(`/hunt_stops?session_date=eq.${sessionDate}&order=sort_order.asc,created_at.asc`);
      setStops(data); setConnected(true);
    } catch {
      try { const l = localStorage.getItem(`fs_${sessionDate}`); if (l) setStops(JSON.parse(l)); } catch {}
      setConnected(false);
    }
  }, [sessionDate]);

  useEffect(() => {
    loadStops();
    clearInterval(pollRef.current);
    pollRef.current = setInterval(loadStops, 8000);
    return () => clearInterval(pollRef.current);
  }, [loadStops]);

  useEffect(() => { try { localStorage.setItem(`fs_${sessionDate}`, JSON.stringify(stops)); } catch {} }, [stops, sessionDate]);

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(
      p => { setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setGpsReady(true); },
      () => setGpsReady(false),
      { enableHighAccuracy: true, maximumAge: 4000 }
    );
    return () => navigator.geolocation.clearWatch(watchId.current);
  }, []);

  const addStop = async (address, name, type, openTime, closeTime) => {
    if (!address.trim()) return;
    setAdding(true);
    try {
      const geo = await geocode(address);
      const stop = {
        session_date: sessionDate,
        name: name.trim() || address.split(",")[0],
        address: address.trim(),
        lat: geo?.lat ?? null, lng: geo?.lng ?? null,
        type, notes: "", status: "pending",
        est_minutes: defaultMins,
        open_time: openTime || null,
        close_time: closeTime || null,
        sort_order: stops.length,
      };
      if (connected) {
        const [created] = await sbFetch("/hunt_stops", { method: "POST", body: JSON.stringify(stop) });
        setStops(p => [...p, created]);
      } else {
        setStops(p => [...p, { ...stop, id: crypto.randomUUID(), created_at: new Date().toISOString() }]);
      }
      showToast(`📍 Added: ${stop.name}`);
      setNewAddr(""); setNewName(""); setNewOpen(""); setNewClose("");
    } catch { showToast("⚠️ Couldn't add stop"); }
    finally { setAdding(false); }
  };

  const handlePaste = async () => {
    const lines = pasteText.split("\n").map(l => l.trim()).filter(l => l.length > 5);
    if (!lines.length) return;
    setPasting(true);
    for (const line of lines) { await addStop(line, "", newType, "", ""); await new Promise(r => setTimeout(r, 350)); }
    setPasting(false); setPasteModal(false); setPasteText("");
  };

  const updateStop = async (id, patch) => {
    setStops(p => p.map(s => s.id === id ? { ...s, ...patch } : s));
    if (connected) { try { await sbFetch(`/hunt_stops?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) }); } catch {} }
  };

  const deleteStop = async (id) => {
    setStops(p => p.filter(s => s.id !== id)); setExpandedId(null);
    if (connected) { try { await sbFetch(`/hunt_stops?id=eq.${id}`, { method: "DELETE" }); } catch {} }
  };

  const handleMark = () => {
    if (gpsReady && userPos) { setPending(userPos); setMapSheet("new"); }
    else setMapSheet("noGps");
  };

  const confirmPin = (status) => {
    if (!pendingPos) return;
    setMapPins(p => [...p, { id: Date.now(), ...pendingPos, status }]);
    setMapSheet(null); setPending(null);
    showToast(`${STOP_STATUS[status]?.emoji ?? "📍"} Marked`);
  };

  const geocodeManual = async () => {
    if (!manualAddr.trim()) return;
    setGeocoding(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(manualAddr)}&format=json&limit=1`);
      const d = await r.json();
      if (d[0]) { setPending({ lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }); setManual(""); setMapSheet("new"); }
      else showToast("⚠️ Address not found");
    } catch { showToast("⚠️ Geocoding failed"); }
    finally { setGeocoding(false); }
  };

  const updatePin = (id, status) => { setMapPins(p => p.map(x => x.id===id?{...x,status}:x)); setMapSheet(null); setEditPin(null); showToast(`${STOP_STATUS[status]?.emoji ?? "📍"} Updated`); };
  const deletePin = (id) => { setMapPins(p => p.filter(x => x.id!==id)); setMapSheet(null); setEditPin(null); showToast("Pin removed"); };

  // Schedule
  const scheduled = buildSchedule(stops, startTime, defaultMins);

  // Day status
  const pendingStops = scheduled.filter(s => s.status === "pending");
  let dayStatus = null;
  if (stops.length > 0 && pendingStops.length > 0) {
    const next = pendingStops[0];
    const diff = next.arriveAt - nowMins;
    if (diff > 10) dayStatus = { type: "ahead", msg: `Running ${Math.abs(diff)}min ahead` };
    else if (diff < -10) dayStatus = { type: "behind", msg: `Running ${Math.abs(diff)}min behind` };
    else dayStatus = { type: "ontrack", msg: "Right on schedule 👌" };
  } else if (stops.length > 0 && pendingStops.length === 0) {
    dayStatus = { type: "ahead", msg: "All stops done! 🎉" };
  }

  const total   = stops.length;
  const visited = stops.filter(s => s.status==="visited").length;
  const pending = stops.filter(s => s.status==="pending").length;
  const skipped = stops.filter(s => s.status==="skip").length;
  const today   = new Date().toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });

  return (
    <>
      <style>{STYLES}</style>
      <div className="shell">

        {/* HEADER */}
        <div className="app-header">
          <div className="app-logo"><span>Flip</span>Scout</div>
          <div className="header-right">
            <div className={`sync-dot ${connected?"live":""}`}/>
            <div className="date-badge">{today}</div>
          </div>
        </div>

        <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", minHeight:0 }}>

          {/* ══════════ PLAN TAB ══════════ */}
          {activeTab === "plan" && (
            <div className="page">
              <div className="plan-wrap">

                {/* Stats */}
                <div className="stats-row">
                  <div className="stat-chip"><div className="stat-num">{total}</div><div className="stat-lbl">STOPS</div></div>
                  <div className="stat-chip"><div className="stat-num amber">{pending}</div><div className="stat-lbl">LEFT</div></div>
                  <div className="stat-chip"><div className="stat-num green">{visited}</div><div className="stat-lbl">DONE</div></div>
                  <div className="stat-chip"><div className="stat-num gray">{skipped}</div><div className="stat-lbl">SKIPPED</div></div>
                </div>

                {/* Schedule settings + timeline */}
                <div className="section-card">
                  <div className="section-label">DAY SCHEDULE</div>
                  <div className="settings-row">
                    <div className="settings-field">
                      <div className="field-label">START</div>
                      <input className="field-input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                    </div>
                    <div className="settings-field">
                      <div className="field-label">END</div>
                      <input className="field-input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                    </div>
                    <div className="settings-field">
                      <div className="field-label">DATE</div>
                      <input className="field-input" type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="field-label" style={{ marginBottom:6 }}>DEFAULT MINS PER STOP</div>
                  <div className="mins-row">
                    {[10,15,20,30,45].map(m => (
                      <button key={m} className={`mins-chip ${defaultMins===m?"active":""}`} onClick={() => setDefaultMins(m)}>{m}m</button>
                    ))}
                  </div>

                  {/* Timeline */}
                  {scheduled.length > 0 && (
                    <div className="timeline">
                      {scheduled.map((stop, i) => {
                        const st   = STOP_TYPES[stop.type] || STOP_TYPES.garage;
                        const isNow = stop.arriveAt <= nowMins && nowMins < stop.leaveAt;
                        const dotCol = stop.status==="visited" ? "#22c55e" : stop.status==="skip" ? "#6b7280" : st.color;
                        const tooEarly = stop.open_time && stop.arriveAt < timeToMins(stop.open_time);
                        return (
                          <div className="tl-row" key={stop.id}>
                            <div className={`tl-time ${isNow?"now":""}`}>{minsToTime(stop.arriveAt)}</div>
                            <div className="tl-spine">
                              <div className="tl-dot" style={{ background: dotCol }}/>
                              {i < scheduled.length - 1 && <div className="tl-line"/>}
                            </div>
                            <div className="tl-content">
                              <div className={`tl-name ${isNow?"is-now":""}`}>{st.emoji} {stop.name}</div>
                              <div className="tl-meta">
                                <span>{stop.est_minutes || defaultMins}min</span>
                                {stop.open_time && <span>{minsToTime(timeToMins(stop.open_time))}–{stop.close_time ? minsToTime(timeToMins(stop.close_time)) : "?"}</span>}
                                {tooEarly && <span className="tl-warn">⚠️ Opens later</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div className="tl-end">
                        <div className="tl-end-time">{minsToTime(timeToMins(endTime))}</div>
                        <div className="tl-end-dot"/>
                        <div className="tl-end-label">Done for the day</div>
                      </div>
                    </div>
                  )}

                  {dayStatus && (
                    <div className={`day-status ${dayStatus.type}`}>
                      {dayStatus.type==="ahead"?"✅":dayStatus.type==="behind"?"⚠️":"👌"} {dayStatus.msg}
                    </div>
                  )}
                </div>

                {/* Add stop */}
                <div className="add-card">
                  <div className="section-label">ADD A STOP</div>
                  <div className="type-row">
                    {Object.entries(STOP_TYPES).map(([k,v]) => (
                      <button key={k} className={`type-chip ${newType===k?"active":""}`}
                        style={{ background:newType===k?v.color:"none", color:newType===k?"#0c0c10":"var(--muted)", borderColor:newType===k?v.color:"var(--border)" }}
                        onClick={() => setNewType(k)}
                      >
                        {v.emoji} {v.label}
                      </button>
                    ))}
                  </div>
                  <input className="add-input" placeholder="Name (e.g. Johnson Estate)" value={newName} onChange={e => setNewName(e.target.value)} />
                  <input className="add-input" placeholder="Address (e.g. 123 Oak St, Hoover AL)" value={newAddr} onChange={e => setNewAddr(e.target.value)} onKeyDown={e => e.key==="Enter"&&addStop(newAddr,newName,newType,newOpen,newClose)} />
                  <div className="hours-row">
                    <div className="hours-field">
                      <div className="field-label">OPENS (optional)</div>
                      <input className="field-input" type="time" value={newOpen} onChange={e => setNewOpen(e.target.value)} />
                    </div>
                    <div className="hours-field">
                      <div className="field-label">CLOSES (optional)</div>
                      <input className="field-input" type="time" value={newClose} onChange={e => setNewClose(e.target.value)} />
                    </div>
                  </div>
                  <div className="add-actions">
                    <button className="add-btn" onClick={() => addStop(newAddr,newName,newType,newOpen,newClose)} disabled={adding||!newAddr.trim()}>
                      {adding ? "…" : "+ ADD STOP"}
                    </button>
                    <button className="paste-btn" onClick={() => setPasteModal(true)}>📋 PASTE LIST</button>
                  </div>
                </div>

                {/* Stops list */}
                {stops.length > 0 && (
                  <>
                    <div className="stops-header">
                      <span className="stops-header-label">YOUR STOPS</span>
                      <button className="clear-all-btn" onClick={() => {
                        if (!window.confirm(`Clear all ${stops.length} stops?`)) return;
                        if (connected) sbFetch(`/hunt_stops?session_date=eq.${sessionDate}`,{method:"DELETE"}).catch(()=>{});
                        setStops([]);
                      }}>CLEAR ALL</button>
                    </div>

                    {scheduled.map(stop => {
                      const st    = STOP_TYPES[stop.type] || STOP_TYPES.garage;
                      const ms    = STOP_STATUS[stop.status] || STOP_STATUS.pending;
                      const isOpen = expandedId === stop.id;
                      const tooEarly = stop.open_time && stop.arriveAt < timeToMins(stop.open_time);
                      return (
                        <div key={stop.id} className={`stop-card ${stop.status}`} style={{ borderColor:isOpen?st.color+"55":undefined }}>
                          <div className="stop-main" onClick={() => setExpandedId(isOpen?null:stop.id)}>
                            <div className="stop-emoji">{st.emoji}</div>
                            <div className="stop-info">
                              <div className="stop-name">{stop.name}</div>
                              <div className="stop-addr">{stop.address}</div>
                              <div className="stop-pills">
                                <span className="pill pill-time">{minsToTime(stop.arriveAt)}</span>
                                <span className="pill pill-status" style={{ background:ms.color+"22", color:ms.color }}>{ms.emoji} {ms.label}</span>
                                {stop.open_time && <span className="pill pill-hours">{minsToTime(timeToMins(stop.open_time))}{stop.close_time?`–${minsToTime(timeToMins(stop.close_time))}`:"+"}</span>}
                                {tooEarly && <span className="pill pill-warn">⚠️ Opens later</span>}
                                {stop.notes && <span className="pill pill-note">"{stop.notes}"</span>}
                              </div>
                            </div>
                            <span className={`stop-chevron ${isOpen?"open":""}`}>›</span>
                          </div>

                          {isOpen && (
                            <div className="stop-expanded">
                              <div className="status-btns">
                                {Object.entries(STOP_STATUS).map(([k,v]) => (
                                  <button key={k} className="status-btn"
                                    style={{ borderColor:v.color, color:v.color, background:stop.status===k?v.color+"22":"none" }}
                                    onClick={() => updateStop(stop.id,{status:k})}
                                  >
                                    <span className="status-btn-emoji">{v.emoji}</span>
                                    <span className="status-btn-label">{v.label}</span>
                                  </button>
                                ))}
                              </div>
                              <div className="expand-fields">
                                <div className="expand-field">
                                  <div className="field-label">MINS HERE</div>
                                  <div className="mins-row">
                                    {[10,15,20,30,45].map(m => (
                                      <button key={m} className={`mins-chip ${(stop.est_minutes||defaultMins)===m?"active":""}`} onClick={() => updateStop(stop.id,{est_minutes:m})}>{m}m</button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <textarea className="stop-notes-input" rows={2} placeholder="Notes… (e.g. lots of tools, cash only, Pete says good stuff)" value={stop.notes||""} onChange={e => updateStop(stop.id,{notes:e.target.value})} />
                              <div className="stop-actions">
                                <button className="s-btn nav-btn-s" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`,"_blank")}>🧭 Navigate</button>
                                <button className="s-btn" onClick={() => { navigator.clipboard?.writeText(stop.address); showToast("Copied!"); }}>📋 Copy</button>
                                <button className="s-btn danger" onClick={() => deleteStop(stop.id)}>🗑 Remove</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {stops.length === 0 && (
                  <div className="empty">
                    <span className="empty-icon">🗓</span>
                    <div className="empty-text">No stops planned yet.<br/>Add addresses from estatesales.net,<br/>Facebook, or Craigslist above.</div>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* ══════════ MAP TAB ══════════ */}
          {activeTab === "map" && (
            <div className="page map-page">
              <LeafletMap
                userPos={userPos}
                gpsReady={gpsReady}
                stops={scheduled}
                mapPins={mapPins}
                nowMins={nowMins}
                onMarkClick={handleMark}
                onStopClick={(stop) => { setActiveTab("plan"); setExpandedId(stop.id); }}
                onPinClick={(pin) => { setEditPin(pin); setMapSheet("editPin"); }}
                onClearPins={() => { if(window.confirm("Clear on-the-fly pins?")) setMapPins([]); }}
              />

              {/* Mark sheet */}
              {mapSheet === "new" && (
                <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setMapSheet(null)}>
                  <div className="sheet">
                    <div className="sheet-handle"/>
                    <div className="sheet-title">MARK THIS HOUSE</div>
                    <div className="sheet-status-row">
                      {Object.entries(STOP_STATUS).map(([k,v]) => (
                        <button key={k} className="sh-status-btn" style={{borderColor:v.color,color:v.color}} onClick={()=>confirmPin(k)}>
                          <span className="sh-status-emoji">{v.emoji}</span>
                          <span className="sh-status-label">{v.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Edit pin sheet */}
              {mapSheet === "editPin" && editPin && (
                <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setMapSheet(null)}>
                  <div className="sheet">
                    <div className="sheet-handle"/>
                    <div className="sheet-title">UPDATE THIS HOUSE</div>
                    <div className="sheet-status-row">
                      {Object.entries(STOP_STATUS).map(([k,v]) => (
                        <button key={k} className="sh-status-btn"
                          style={{borderColor:v.color,color:v.color,background:editPin.status===k?v.color+"22":"none"}}
                          onClick={()=>updatePin(editPin.id,k)}
                        >
                          <span className="sh-status-emoji">{v.emoji}</span>
                          <span className="sh-status-label">{v.label}</span>
                        </button>
                      ))}
                    </div>
                    <button className="sh-del-btn" onClick={()=>deletePin(editPin.id)}>🗑 Remove this pin</button>
                  </div>
                </div>
              )}

              {/* No GPS sheet */}
              {mapSheet === "noGps" && (
                <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setMapSheet(null)}>
                  <div className="sheet">
                    <div className="sheet-handle"/>
                    <div className="no-gps-title">GPS not available</div>
                    <div className="no-gps-sub">Enable location in your browser settings, or type an address to drop a pin manually.</div>
                    <input className="addr-input" placeholder="123 Oak St, Birmingham AL" value={manualAddr} onChange={e=>setManual(e.target.value)} onKeyDown={e=>e.key==="Enter"&&geocodeManual()} autoFocus />
                    <button className="primary-btn" onClick={geocodeManual} disabled={geocoding||!manualAddr.trim()}>{geocoding?"Finding…":"Drop Pin Here"}</button>
                    <button className="cancel-btn" onClick={()=>setMapSheet(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* BOTTOM NAV */}
        <nav className="bottom-nav">
          <button className={`nav-btn ${activeTab==="plan"?"active":""}`} onClick={()=>setActiveTab("plan")}>
            <span className="nav-icon">📋</span>
            <span className="nav-label">PLAN</span>
          </button>
          <button className={`nav-btn ${activeTab==="map"?"map-active":""}`} onClick={()=>setActiveTab("map")}>
            <span className="nav-icon">🗺️</span>
            <span className="nav-label">MAP</span>
          </button>
        </nav>

        {/* Paste modal */}
        {pasteModal && (
          <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setPasteModal(false)}>
            <div className="sheet">
              <div className="sheet-handle"/>
              <div style={{fontSize:17,fontWeight:700,color:"var(--text)",marginBottom:6}}>Paste Addresses</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"var(--muted)",lineHeight:1.6,marginBottom:14}}>
                One address per line. Works great with estatesales.net, Facebook Marketplace, or Craigslist.
              </div>
              <textarea className="paste-area" rows={7}
                placeholder={"123 Oak St, Birmingham AL\n456 Maple Ave, Hoover AL\n789 Pine Rd, Vestavia AL"}
                value={pasteText} onChange={e=>setPasteText(e.target.value)} autoFocus
              />
              <div className="modal-actions">
                <button className="ghost-btn" onClick={()=>setPasteModal(false)}>Cancel</button>
                <button className="primary-btn" style={{flex:1}} onClick={handlePaste} disabled={pasting||!pasteText.trim()}>
                  {pasting?"Adding…":`Add ${pasteText.split("\n").filter(l=>l.trim().length>5).length} Stops`}
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}
