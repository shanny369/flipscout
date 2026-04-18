import React, { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE
// ═══════════════════════════════════════════════════════════════════════════════
const SUPABASE_URL = "https://wiwftjtaclrwdxgcrffk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpd2Z0anRhY2xyd2R4Z2NyZmZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjIyNTYsImV4cCI6MjA5MDI5ODI1Nn0.EKQL7I62SCPnOPcOI__0yeFDgruPuDbu3xEl_138iZU";

// SQL (run once in Supabase):
// alter table hunt_stops add column if not exists drive_override integer default null;

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
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [];
}

async function geocode(address) {
  try {
    const r = await fetch(`/api/claude?type=geocode&address=${encodeURIComponent(address)}`);
    const d = await r.json();
    if (d[0]) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
  } catch {}
  return null;
}

// Haversine distance in miles
function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Estimate drive time from distance (assumes ~25 mph avg for suburban/rural Saturday)
function estimateDriveMins(miles) {
  if (miles < 0.5) return 5;
  if (miles < 2)   return Math.round(miles * 4);
  if (miles < 10)  return Math.round(miles * 2.5);
  return Math.round(miles * 2);
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

const MINS_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120];
const DRIVE_OPTIONS = [5, 10, 15, 20, 30, 45, 60];

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
  return `${h % 12 || 12}:${min.toString().padStart(2, "0")} ${ampm}`;
}

function minsLabel(m) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return min ? `${h}h ${min}m` : `${h}h`;
}

function getNowMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

// Build schedule with smart drive times
function buildSchedule(stops, startTime, defaultMins, defaultDrive) {
  let cursor = timeToMins(startTime) || timeToMins("08:00");
  return stops.map((stop, i) => {
    const arriveAt = cursor;
    const dur = stop.est_minutes || defaultMins;

    // Calculate drive to NEXT stop
    let driveToNext = defaultDrive;
    if (stop.drive_override != null) {
      driveToNext = stop.drive_override;
    } else if (stop.lat && stop.lng && i < stops.length - 1) {
      const next = stops[i + 1];
      if (next.lat && next.lng) {
        const miles = distanceMiles(stop.lat, stop.lng, next.lat, next.lng);
        driveToNext = estimateDriveMins(miles);
      }
    }

    cursor += dur + (i < stops.length - 1 ? driveToNext : 0);
    return { ...stop, arriveAt, leaveAt: arriveAt + dur, driveToNext };
  });
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

  .app-header { background: var(--bg); border-bottom: 1px solid var(--border); padding: 12px 16px 10px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .app-logo { font-family: 'Bebas Neue', sans-serif; font-size: 22px; letter-spacing: 3px; line-height: 1; }
  .app-logo span { color: var(--accent); }
  .header-right { display: flex; align-items: center; gap: 8px; }
  .sync-dot { width: 7px; height: 7px; border-radius: 50%; background: #6b7280; flex-shrink: 0; }
  .sync-dot.live { background: #22c55e; animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .date-badge { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--muted); }

  .bottom-nav { display: flex; background: #0a0a0e; border-top: 1px solid var(--border); flex-shrink: 0; z-index: 200; }
  .nav-btn { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; padding: 10px 0 16px; background: none; border: none; cursor: pointer; color: var(--muted); transition: color 0.15s; }
  .nav-btn.active { color: var(--accent); }
  .nav-btn.map-active { color: #60a5fa; }
  .nav-icon { font-size: 20px; line-height: 1; }
  .nav-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1px; }

  .page { flex: 1; overflow-y: auto; min-height: 0; }
  .page.map-page { overflow: hidden; display: flex; flex-direction: column; }
  .plan-wrap { padding: 12px 12px 80px; display: flex; flex-direction: column; gap: 10px; }

  /* STATS */
  .stats-row { display: flex; gap: 6px; }
  .stat-chip { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 8px 4px; text-align: center; min-width: 0; }
  .stat-num { font-family: 'Bebas Neue', sans-serif; font-size: 24px; line-height: 1; color: var(--text); }
  .stat-num.amber { color: var(--accent); }
  .stat-num.green { color: var(--green); }
  .stat-num.gray  { color: #6b7280; }
  .stat-lbl { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--muted); letter-spacing: 1px; margin-top: 2px; }

  /* CARDS */
  .section-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 13px; overflow: hidden; }
  .section-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; color: var(--muted); margin-bottom: 10px; }

  .settings-row { display: flex; gap: 7px; margin-bottom: 10px; }
  .settings-field { flex: 1; min-width: 0; }
  .field-label { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); letter-spacing: 0.5px; margin-bottom: 4px; }
  .field-input { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 7px 8px; color: var(--text); font-family: 'DM Mono', monospace; font-size: 12px; outline: none; transition: border-color 0.2s; }
  .field-input:focus { border-color: var(--accent); }

  .chips-row { display: flex; gap: 5px; flex-wrap: wrap; }
  .chip { padding: 4px 10px; border-radius: 20px; border: 1px solid var(--border); background: none; color: var(--muted); font-family: 'DM Mono', monospace; font-size: 11px; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .chip.active { background: var(--accent); color: #0c0c10; border-color: var(--accent); font-weight: 600; }

  /* DAY STATUS */
  .day-status { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 9px; font-family: 'DM Mono', monospace; font-size: 11px; margin-top: 10px; }
  .day-status.ahead   { background: rgba(34,197,94,0.1);  color: var(--green); border: 1px solid rgba(34,197,94,0.2); }
  .day-status.behind  { background: rgba(244,63,94,0.1);  color: var(--red);   border: 1px solid rgba(244,63,94,0.2); }
  .day-status.ontrack { background: rgba(245,158,11,0.1); color: var(--accent);border: 1px solid rgba(245,158,11,0.2); }

  /* TIMELINE */
  .timeline { display: flex; flex-direction: column; margin-top: 12px; }
  .tl-row { display: flex; align-items: flex-start; position: relative; }
  .tl-time { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); text-align: right; padding-right: 8px; width: 50px; flex-shrink: 0; padding-top: 1px; line-height: 1.4; }
  .tl-time.now { color: var(--accent); font-weight: 600; }
  .tl-spine { width: 18px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; position: relative; }
  .tl-dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 2px; z-index: 1; flex-shrink: 0; }
  .tl-line { position: absolute; top: 11px; bottom: 0; width: 2px; background: var(--border); }
  .tl-content { flex: 1; padding-bottom: 4px; padding-left: 6px; min-width: 0; }
  .tl-name { font-size: 12px; font-weight: 600; color: var(--text); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl-name.is-now { color: var(--accent); }
  .tl-meta { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl-warn { color: var(--red); }

  /* DRIVE ROW in timeline */
  .tl-drive-row { display: flex; align-items: center; padding: 3px 0 3px 68px; }
  .tl-drive-line { width: 2px; height: 16px; background: var(--border); margin-right: 8px; flex-shrink: 0; }
  .tl-drive-label { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); }
  .tl-drive-label.overridden { color: #f59e0b88; }

  .tl-end { display: flex; align-items: center; }
  .tl-end-time { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); text-align: right; padding-right: 8px; width: 50px; flex-shrink: 0; }
  .tl-end-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--border); border: 2px solid #3a3a4a; flex-shrink: 0; margin-left: 4px; }
  .tl-end-label { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); padding-left: 8px; }

  /* ADD / EDIT STOP */
  .add-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 13px; overflow: hidden; }
  .type-row { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 10px; }
  .type-chip { padding: 4px 9px; border-radius: 7px; border: 1px solid var(--border); background: none; font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 3px; white-space: nowrap; }
  .type-chip.active { color: #0c0c10; border-color: transparent; font-weight: 600; }

  .add-input { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 9px 12px; color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 13px; outline: none; transition: border-color 0.2s; margin-bottom: 7px; }
  .add-input:focus { border-color: var(--accent); }
  .add-input::placeholder { color: var(--muted); }

  .two-col { display: flex; gap: 7px; margin-bottom: 7px; }
  .two-col .settings-field { flex: 1; min-width: 0; }

  .add-actions { display: flex; gap: 7px; }
  .add-btn { flex: 1; padding: 10px; background: var(--accent); color: #0c0c10; border: none; border-radius: 8px; font-family: 'Bebas Neue', sans-serif; font-size: 15px; letter-spacing: 2px; cursor: pointer; transition: all 0.15s; }
  .add-btn:hover:not(:disabled) { background: #fbbf24; }
  .add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .add-btn.cancel-edit { background: var(--surface2); color: var(--muted); border: 1px solid var(--border); }
  .paste-btn { padding: 10px 12px; background: none; border: 1px solid var(--border); border-radius: 8px; color: var(--muted); font-family: 'DM Mono', monospace; font-size: 11px; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .paste-btn:hover { color: var(--text); border-color: var(--text); }

  /* STOPS LIST */
  .stops-header { display: flex; align-items: center; justify-content: space-between; padding: 0 2px; }
  .stops-header-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; color: var(--muted); }
  .stops-header-actions { display: flex; gap: 10px; align-items: center; }
  .sort-btn { font-family: 'DM Mono', monospace; font-size: 10px; color: #60a5fa; background: none; border: none; cursor: pointer; letter-spacing: 0.5px; padding: 0; }
  .clear-all-btn { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); background: none; border: none; cursor: pointer; letter-spacing: 0.5px; padding: 0; }
  .clear-all-btn:hover { color: var(--red); }

  .stop-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: border-color 0.15s; }
  .stop-card.visited { border-color: rgba(34,197,94,0.35); }
  .stop-card.skip    { opacity: 0.55; }

  .stop-main { padding: 11px 12px; display: flex; align-items: flex-start; gap: 9px; cursor: pointer; }
  .stop-order-num { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--muted); background: var(--surface2); border-radius: 5px; padding: 2px 6px; flex-shrink: 0; margin-top: 1px; }
  .stop-emoji { font-size: 20px; flex-shrink: 0; line-height: 1.1; }
  .stop-info { flex: 1; min-width: 0; overflow: hidden; }
  .stop-name { font-size: 13px; font-weight: 600; color: var(--text); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stop-addr { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
  .stop-pills { display: flex; align-items: center; gap: 5px; margin-top: 4px; flex-wrap: wrap; }
  .pill { font-family: 'DM Mono', monospace; font-size: 10px; padding: 2px 7px; border-radius: 5px; white-space: nowrap; }
  .pill-time   { color: var(--accent); background: rgba(245,158,11,0.12); }
  .pill-status { }
  .pill-hours  { color: #60a5fa; background: rgba(96,165,250,0.1); }
  .pill-warn   { color: var(--red); background: rgba(244,63,94,0.1); }
  .pill-note   { color: var(--muted); font-style: italic; font-family: 'DM Sans', sans-serif; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
  .stop-chevron { color: var(--muted); font-size: 16px; transition: transform 0.2s; flex-shrink: 0; margin-top: 2px; }
  .stop-chevron.open { transform: rotate(90deg); }

  .stop-expanded { border-top: 1px solid var(--border); padding: 11px 12px; background: rgba(0,0,0,0.2); display: flex; flex-direction: column; gap: 9px; }

  .status-btns { display: flex; gap: 7px; }
  .status-btn { flex: 1; padding: 9px 4px; border-radius: 9px; border: 1.5px solid; background: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; transition: all 0.12s; min-width: 0; }
  .status-btn:active { transform: scale(0.95); }
  .status-btn-emoji { font-size: 18px; line-height: 1; }
  .status-btn-label { font-family: 'DM Mono', monospace; font-size: 10px; }

  .expand-two { display: flex; gap: 7px; }
  .expand-field { flex: 1; min-width: 0; }

  .stop-notes-input { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 11px; color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 13px; outline: none; resize: none; transition: border-color 0.2s; }
  .stop-notes-input:focus { border-color: var(--accent); }
  .stop-notes-input::placeholder { color: var(--muted); }

  .stop-actions { display: flex; gap: 6px; }
  .s-btn { flex: 1; padding: 7px 4px; border-radius: 7px; border: 1px solid var(--border); background: none; color: var(--muted); font-family: 'DM Mono', monospace; font-size: 10px; cursor: pointer; transition: all 0.15s; text-align: center; white-space: nowrap; }
  .s-btn:hover { color: var(--text); border-color: var(--text); }
  .s-btn.danger:hover { color: var(--red); border-color: var(--red); }
  .s-btn.nav-s { background: rgba(96,165,250,0.1); color: #60a5fa; border-color: rgba(96,165,250,0.25); }
  .s-btn.edit-s { background: rgba(245,158,11,0.1); color: var(--accent); border-color: rgba(245,158,11,0.25); }

  /* REORDER ARROWS */
  .reorder-btns { display: flex; gap: 4px; flex-shrink: 0; margin-top: 2px; }
  .reorder-btn { width: 24px; height: 24px; border-radius: 5px; border: 1px solid var(--border); background: none; color: var(--muted); font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; padding: 0; }
  .reorder-btn:hover { color: var(--text); border-color: var(--text); }
  .reorder-btn:disabled { opacity: 0.2; cursor: not-allowed; }

  /* EMPTY */
  .empty { text-align: center; padding: 36px 20px; color: var(--muted); }
  .empty-icon { font-size: 40px; margin-bottom: 10px; display: block; }
  .empty-text { font-size: 13px; line-height: 1.6; }

  /* MAP */
  .map-outer { flex: 1; position: relative; overflow: hidden; min-height: 0; display: flex; flex-direction: column; padding-bottom: 90px; }
  .map-inner { flex: 1; min-height: 0; }
  .map-legend { position: absolute; top: 12px; left: 12px; z-index: 100; background: rgba(10,10,14,0.92); border: 1px solid #2a2a3a; border-radius: 10px; padding: 8px 12px; backdrop-filter: blur(10px); display: flex; flex-direction: column; gap: 5px; }
  .legend-row { display: flex; align-items: center; gap: 7px; font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.6); }
  .legend-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .map-clear-btn { position: absolute; top: 12px; right: 12px; z-index: 100; background: rgba(10,10,14,0.92); border: 1px solid #2a2a3a; border-radius: 8px; padding: 7px 12px; color: rgba(255,255,255,0.4); font-family: 'DM Mono', monospace; font-size: 10px; cursor: pointer; backdrop-filter: blur(10px); transition: all 0.15s; }
  .map-clear-btn:hover { color: var(--red); border-color: var(--red); }
  .gps-pill { position: absolute; bottom: 118px; right: 12px; z-index: 100; background: rgba(10,10,14,0.92); border: 1px solid #2a2a3a; border-radius: 20px; padding: 5px 12px; font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.4); backdrop-filter: blur(10px); display: flex; align-items: center; gap: 6px; }
  .gps-dot { width: 6px; height: 6px; border-radius: 50%; background: #6b7280; }
  .gps-dot.on { background: #22c55e; animation: gpsPulse 1.6s ease-in-out infinite; }
  @keyframes gpsPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .mark-wrap { display: none; }
  .mark-btn { width: 68px; height: 68px; border-radius: 50%; background: var(--accent); border: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; box-shadow: 0 6px 24px rgba(245,158,11,0.5); transition: transform 0.1s; }
  .mark-btn:active { transform: scale(0.92); }
  .mark-icon { font-size: 22px; line-height: 1; }
  .mark-label { font-family: 'DM Mono', monospace; font-size: 9px; font-weight: 600; color: #0c0c10; letter-spacing: 1px; }
  .mark-hint { font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.4); background: rgba(0,0,0,0.6); padding: 4px 12px; border-radius: 20px; backdrop-filter: blur(8px); }
  .map-strip { position: absolute; bottom: 0; left: 0; right: 0; z-index: 200; background: rgba(10,10,14,0.97); border-top: 1px solid #2a2a3a; padding: 10px 12px 18px; backdrop-filter: blur(12px); }
  .map-strip-label { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--muted); letter-spacing: 1.5px; margin-bottom: 7px; }
  .map-strip-list { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
  .strip-stop { flex-shrink: 0; min-width: 100px; max-width: 130px; background: var(--surface); border: 1px solid var(--border); border-radius: 9px; padding: 7px 9px; cursor: pointer; transition: border-color 0.15s; overflow: hidden; }
  .strip-stop.is-now { border-color: var(--accent); }
  .strip-stop.is-done { opacity: 0.45; }
  .strip-name { font-size: 11px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px; }
  .strip-meta { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
  .strip-time { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--accent); }

  /* SHEETS */
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.72); z-index: 500; display: flex; align-items: flex-end; }
  .sheet { width: 100%; background: #161620; border-radius: 20px 20px 0 0; padding: 14px 18px 48px; animation: sheetUp 0.2s cubic-bezier(0.34,1.3,0.64,1); max-height: 80vh; overflow-y: auto; }
  @keyframes sheetUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
  .sheet-handle { width: 36px; height: 4px; background: #2a2a3a; border-radius: 2px; margin: 0 auto 16px; }
  .sheet-title { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--muted); letter-spacing: 2px; text-align: center; margin-bottom: 14px; }
  .sheet-status-row { display: flex; gap: 9px; }
  .sh-btn { flex: 1; padding: 13px 4px; border-radius: 11px; border: 2px solid; background: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; transition: transform 0.1s; }
  .sh-btn:active { transform: scale(0.94); }
  .sh-emoji { font-size: 24px; line-height: 1; }
  .sh-label { font-family: 'DM Mono', monospace; font-size: 10px; }
  .sh-del-btn { width: 100%; margin-top: 11px; padding: 11px; background: none; border: 1px solid #2a2a3a; border-radius: 10px; color: #555; font-family: 'DM Mono', monospace; font-size: 12px; cursor: pointer; transition: all 0.15s; }
  .sh-del-btn:hover { border-color: var(--red); color: var(--red); }
  .no-gps-title { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 7px; }
  .no-gps-sub { font-family: 'DM Mono', monospace; font-size: 12px; color: var(--muted); line-height: 1.6; margin-bottom: 14px; }
  .addr-input { width: 100%; background: #0c0c10; border: 1.5px solid #2a2a3a; border-radius: 10px; padding: 11px 13px; color: var(--text); font-family: 'DM Mono', monospace; font-size: 13px; outline: none; margin-bottom: 10px; transition: border-color 0.2s; }
  .addr-input:focus { border-color: var(--accent); }
  .addr-input::placeholder { color: #333; }
  .primary-btn { width: 100%; padding: 12px; background: var(--accent); color: #0c0c10; border: none; border-radius: 10px; font-family: 'Bebas Neue', sans-serif; font-size: 16px; letter-spacing: 2px; cursor: pointer; }
  .primary-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .cancel-btn { width: 100%; padding: 9px; background: none; border: none; color: var(--muted); font-family: 'DM Mono', monospace; font-size: 12px; cursor: pointer; margin-top: 6px; }
  .paste-area { width: 100%; background: #0c0c10; border: 1.5px solid #2a2a3a; border-radius: 10px; padding: 11px 13px; color: var(--text); font-family: 'DM Mono', monospace; font-size: 12px; outline: none; resize: none; margin-bottom: 11px; transition: border-color 0.2s; line-height: 1.6; }
  .paste-area:focus { border-color: var(--accent); }
  .modal-actions { display: flex; gap: 9px; }
  .ghost-btn { padding: 12px 16px; background: none; border: 1px solid var(--border); border-radius: 10px; color: var(--muted); font-family: 'DM Mono', monospace; font-size: 12px; cursor: pointer; }

  .toast { position: fixed; bottom: 75px; left: 50%; transform: translateX(-50%); background: #1e1e2e; border: 1px solid #2a2a3a; color: var(--text); padding: 9px 18px; border-radius: 20px; font-family: 'DM Mono', monospace; font-size: 11px; z-index: 999; white-space: nowrap; animation: toastIn 0.18s ease; pointer-events: none; }
  @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// LEAFLET MAP COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
function LeafletMap({ userPos, gpsReady, stops, mapPins, nowMins, onMarkClick, onStopClick, onPinClick, onClearPins }) {
  const mapDivRef   = useRef(null);
  const leafletRef  = useRef(null);
  const markersRef  = useRef([]);
  const userMkrRef  = useRef(null);
  const initializedRef = useRef(false);

  const renderMarkers = useCallback((L, map, resolvedStops) => {
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    resolvedStops.filter(s => s.lat && s.lng).forEach(stop => {
      const st  = STOP_TYPES[stop.type] || STOP_TYPES.garage;
      const col = stop.status === "pending" ? st.color : (STOP_STATUS[stop.status]?.color ?? st.color);
      const icon = L.divIcon({
        html: `<div style="width:30px;height:34px"><svg width="30" height="34" viewBox="0 0 30 34"><path d="M15,32 C10,24 3,20 3,12 A12,12 0 1,1 27,12 C27,20 20,24 15,32Z" fill="${col}" stroke="white" stroke-width="2"/><text x="15" y="13" text-anchor="middle" dominant-baseline="middle" font-size="10">${st.emoji}</text></svg></div>`,
        iconSize: [30,34], iconAnchor: [15,32], className: ""
      });
      const m = L.marker([stop.lat, stop.lng], { icon }).addTo(map);
      m.on("click", () => onStopClick(stop));
      markersRef.current.push(m);
    });

    mapPins.forEach(pin => {
      const col   = STOP_STATUS[pin.status]?.color ?? "#f59e0b";
      const emoji = STOP_STATUS[pin.status]?.emoji ?? "📍";
      const icon  = L.divIcon({
        html: `<div style="width:24px;height:24px;border-radius:50%;background:${col};border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:10px;box-shadow:0 2px 6px rgba(0,0,0,0.4)">${emoji}</div>`,
        iconSize: [24,24], iconAnchor: [12,12], className: ""
      });
      const m = L.marker([pin.lat, pin.lng], { icon }).addTo(map);
      m.on("click", () => onPinClick(pin));
      markersRef.current.push(m);
    });
  }, [onStopClick, onPinClick, mapPins]);

  // Init Leaflet once
  useEffect(() => {
    if (initializedRef.current || !mapDivRef.current) return;
    initializedRef.current = true;

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
    }

    const init = () => {
      const L = window.L;
      if (!L || !mapDivRef.current) return;
      const center = userPos ? [userPos.lat, userPos.lng] : [33.4, -86.8];
      const map = L.map(mapDivRef.current, { zoomControl: true, attributionControl: false }).setView(center, 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      leafletRef.current = map;
    };

    if (window.L) { init(); }
    else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      s.onload = init;
      document.head.appendChild(s);
    }
    return () => { if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; initializedRef.current = false; } };
  }, []);

  // Invalidate size whenever rendered
  useEffect(() => {
    const t = setTimeout(() => leafletRef.current?.invalidateSize(), 150);
    return () => clearTimeout(t);
  });

  // Update user dot
  useEffect(() => {
    const L = window.L; const map = leafletRef.current;
    if (!L || !map || !userPos) return;
    if (userMkrRef.current) { userMkrRef.current.setLatLng([userPos.lat, userPos.lng]); }
    else {
      const icon = L.divIcon({ html: '<div style="width:14px;height:14px;border-radius:50%;background:#60a5fa;border:2px solid #fff;box-shadow:0 0 8px rgba(96,165,250,0.7)"></div>', iconSize:[14,14], iconAnchor:[7,7], className:"" });
      userMkrRef.current = L.marker([userPos.lat, userPos.lng], { icon }).addTo(map);
      map.setView([userPos.lat, userPos.lng], 16);
    }
  }, [userPos]);

  // Update markers — geocode missing coords on the fly
  useEffect(() => {
    const L = window.L; const map = leafletRef.current;
    if (!L || !map) return;

    const missing = stops.filter(s => (!s.lat || !s.lng) && s.address);
    if (missing.length === 0) { renderMarkers(L, map, stops); return; }

    Promise.all(stops.map(async s => {
      if (s.lat && s.lng) return s;
      try {
        const r = await fetch(`/api/claude?type=geocode&address=${encodeURIComponent(s.address)}`);
        const d = await r.json();
        if (d[0]) return { ...s, lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
      } catch {}
      return s;
    })).then(resolved => {
      renderMarkers(L, map, resolved);
      if (!userPos) {
        const first = resolved.find(s => s.lat && s.lng);
        if (first) map.setView([first.lat, first.lng], 14);
      }
    });
  }, [stops, mapPins, renderMarkers, userPos]);

  return (
    <div className="map-outer">
      <div ref={mapDivRef} className="map-inner" />

      <div className="map-legend">
        {Object.entries(STOP_STATUS).map(([k,v]) => (
          <div className="legend-row" key={k}><div className="legend-dot" style={{background:v.color}}/>{v.label}</div>
        ))}
        <div style={{height:1,background:"#2a2a3a",margin:"3px 0"}}/>
        <div className="legend-row" style={{fontSize:9,color:"rgba(255,255,255,0.3)"}}>Pins = planned · Circles = on-the-fly</div>
      </div>

      {mapPins.length > 0 && <button className="map-clear-btn" onClick={onClearPins}>Clear pins</button>}
      <div className="gps-pill"><div className={`gps-dot ${gpsReady?"on":""}`}/>{gpsReady?"GPS ready":"No GPS"}</div>

      <div className="map-strip">
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button className="mark-btn" onClick={onMarkClick}>
            <span className="mark-icon">📍</span>
            <span className="mark-label">MARK</span>
          </button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--muted)",letterSpacing:1,marginBottom:6}}>
              {gpsReady?"TAP TO MARK THIS HOUSE":"NO GPS — TAP TO ENTER ADDRESS"}
            </div>
            {stops.length > 0 && (
              <div className="map-strip-list">
                {stops.map(stop => {
                  const isNow = stop.arriveAt<=nowMins&&nowMins<stop.leaveAt;
                  const isDone = stop.status==="visited"||stop.status==="skip";
                  return (
                    <div key={stop.id} className={`strip-stop ${isNow?"is-now":""} ${isDone?"is-done":""}`} onClick={() => onStopClick(stop)}>
                      <div className="strip-name">{STOP_TYPES[stop.type]?.emoji} {stop.name}</div>
                      <div className="strip-meta">
                        <span className="strip-time">{minsToTime(stop.arriveAt)}</span>
                        <span style={{fontSize:11}}>{STOP_STATUS[stop.status]?.emoji??"📍"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
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
  const [defaultDrive, setDefaultDrive] = useState(10);
  const [connected, setConnected]     = useState(false);
  const [expandedId, setExpandedId]   = useState(null);
  const [editingStop, setEditingStop] = useState(null); // stop being edited
  const [toast, setToast]             = useState(null);

  // Add form fields
  const [newAddr, setNewAddr]   = useState("");
  const [newName, setNewName]   = useState("");
  const [newType, setNewType]   = useState("garage");
  const [newOpen, setNewOpen]   = useState("");
  const [newClose, setNewClose] = useState("");
  const [adding, setAdding]     = useState(false);
  const [showDone, setShowDone] = useState(false);
  const expandedRef = useRef(null);

  // Paste modal
  const [pasteModal, setPasteModal] = useState(false);
  const [pasteText, setPasteText]   = useState("");
  const [pasting, setPasting]       = useState(false);

  // Map
  const [userPos, setUserPos]     = useState(null);
  const [gpsReady, setGpsReady]   = useState(false);
  const [mapPins, setMapPins]     = useState([]);
  const [mapSheet, setMapSheet]   = useState(null);
  const [editPin, setEditPin]     = useState(null);
  const [pendingPos, setPending]  = useState(null);
  const [manualAddr, setManual]   = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [nowMins, setNowMins]     = useState(getNowMins());

  const watchId  = useRef(null);
  const pollRef  = useRef(null);
  const clockRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2300); };

  const expandStop = (stop) => {
    setExpandedId(stop.id);
    if (stop.status !== "pending") setShowDone(true);
  };

  useEffect(() => { clockRef.current = setInterval(() => setNowMins(getNowMins()), 60000); return () => clearInterval(clockRef.current); }, []);

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

  useEffect(() => {
    if (!navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(
      p => { setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setGpsReady(true); },
      () => setGpsReady(false),
      { enableHighAccuracy: true, maximumAge: 4000 }
    );
    return () => navigator.geolocation.clearWatch(watchId.current);
  }, []);

  const saveStop = async (address, name, type, openTime, closeTime, existingId = null) => {
    if (!address.trim()) return;
    setAdding(true);
    try {
      const geo = await geocode(address);
      const patch = {
        name: name.trim() || address.split(",")[0],
        address: address.trim(),
        lat: geo?.lat ?? null, lng: geo?.lng ?? null,
        type, open_time: openTime || null, close_time: closeTime || null,
      };

      if (existingId) {
        // Edit existing
        await sbFetch(`/hunt_stops?id=eq.${existingId}`, { method: "PATCH", body: JSON.stringify(patch) });
        setStops(p => p.map(s => s.id === existingId ? { ...s, ...patch } : s));
        showToast("✏️ Stop updated");
        setEditingStop(null);
      } else {
        // New stop
        const stop = { session_date: sessionDate, ...patch, notes: "", status: "pending", est_minutes: defaultMins, drive_override: null, sort_order: stops.length };
        if (connected) {
          const [created] = await sbFetch("/hunt_stops", { method: "POST", body: JSON.stringify(stop) });
          setStops(p => [...p, created]);
        } else {
          setStops(p => [...p, { ...stop, id: crypto.randomUUID(), created_at: new Date().toISOString() }]);
        }
        showToast(`📍 Added: ${patch.name}`);
      }
      setNewAddr(""); setNewName(""); setNewOpen(""); setNewClose("");
    } catch (e) { showToast("⚠️ Couldn't save stop"); }
    finally { setAdding(false); }
  };

  const startEdit = (stop) => {
    setEditingStop(stop);
    setNewName(stop.name);
    setNewAddr(stop.address);
    setNewType(stop.type);
    setNewOpen(stop.open_time || "");
    setNewClose(stop.close_time || "");
    window.scrollTo(0, 0);
  };

  const handlePaste = async () => {
    const lines = pasteText.split("\n").map(l => l.trim()).filter(l => l.length > 5);
    if (!lines.length) return;
    setPasting(true);
    for (const line of lines) { await saveStop(line, "", newType, "", ""); await new Promise(r => setTimeout(r, 350)); }
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

  const moveStop = (idx, dir) => {
    const arr = [...stops];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    const updated = arr.map((s, i) => ({ ...s, sort_order: i }));
    setStops(updated);
    if (connected) updated.forEach(s => sbFetch(`/hunt_stops?id=eq.${s.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: s.sort_order }) }).catch(() => {}));
  };

  const sortByRoute = () => {
    const withGeo = stops.filter(s => s.lat && s.lng);
    const without = stops.filter(s => !s.lat || !s.lng);
    if (withGeo.length < 2) { showToast("Need addresses to sort route"); return; }
    const sorted = [withGeo[0]];
    const remaining = withGeo.slice(1);
    while (remaining.length) {
      const last = sorted[sorted.length - 1];
      let nearestIdx = 0, nearestDist = Infinity;
      remaining.forEach((s, i) => {
        const d = distanceMiles(last.lat, last.lng, s.lat, s.lng);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      });
      sorted.push(remaining.splice(nearestIdx, 1)[0]);
    }
    const reordered = [...sorted, ...without].map((s, i) => ({ ...s, sort_order: i }));
    setStops(reordered);
    if (connected) reordered.forEach(s => sbFetch(`/hunt_stops?id=eq.${s.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: s.sort_order }) }).catch(() => {}));
    showToast("🗺️ Route optimized!");
  };

  // Map
  const handleMark = () => { setMapSheet("pickLocation"); };
  const confirmPin = (status) => { if (!pendingPos) return; setMapPins(p => [...p, { id: Date.now(), ...pendingPos, status }]); setMapSheet(null); setPending(null); showToast(`${STOP_STATUS[status]?.emoji} Marked`); };
  const geocodeManual = async () => {
    if (!manualAddr.trim()) return;
    setGeocoding(true);
    try {
      const r = await fetch(`/api/claude?type=geocode&address=${encodeURIComponent(manualAddr)}`);
      const d = await r.json();
      if (d[0]) { setPending({ lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }); setManual(""); setMapSheet("new"); }
      else showToast("⚠️ Address not found");
    } catch { showToast("⚠️ Geocoding failed"); }
    finally { setGeocoding(false); }
  };
  const updatePin = (id, status) => { setMapPins(p => p.map(x => x.id===id?{...x,status}:x)); setMapSheet(null); setEditPin(null); showToast(`${STOP_STATUS[status]?.emoji} Updated`); };
  const deletePin = (id) => { setMapPins(p => p.filter(x => x.id!==id)); setMapSheet(null); setEditPin(null); showToast("Pin removed"); };

  const scheduled = buildSchedule(stops, startTime, defaultMins, defaultDrive);

  const pendingList = scheduled.filter(s => s.status === "pending");
  let dayStatus = null;
  if (stops.length > 0) {
    if (pendingList.length === 0) { dayStatus = { type: "ahead", msg: "All stops done! 🎉" }; }
    else {
      const diff = pendingList[0].arriveAt - nowMins;
      if (diff > 15) dayStatus = { type: "ahead", msg: `${Math.abs(diff)}min ahead of schedule` };
      else if (diff < -15) dayStatus = { type: "behind", msg: `${Math.abs(diff)}min behind schedule` };
      else dayStatus = { type: "ontrack", msg: "Right on schedule 👌" };
    }
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

        <div className="app-header">
          <div className="app-logo"><span>Flip</span>Scout</div>
          <div className="header-right">
            <div className={`sync-dot ${connected?"live":""}`}/>
            <div className="date-badge">{today}</div>
          </div>
        </div>

        <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", minHeight:0 }}>

          {/* ══ PLAN TAB ══ */}
          {activeTab === "plan" && (
            <div className="page">
              <div className="plan-wrap">

                <div className="stats-row">
                  <div className="stat-chip"><div className="stat-num">{total}</div><div className="stat-lbl">STOPS</div></div>
                  <div className="stat-chip"><div className="stat-num amber">{pending}</div><div className="stat-lbl">LEFT</div></div>
                  <div className="stat-chip"><div className="stat-num green">{visited}</div><div className="stat-lbl">DONE</div></div>
                  <div className="stat-chip"><div className="stat-num gray">{skipped}</div><div className="stat-lbl">SKIPPED</div></div>
                </div>

                {/* Schedule settings */}
                <div className="section-card">
                  <div className="section-label">DAY SCHEDULE</div>
                  <div className="settings-row">
                    <div className="settings-field"><div className="field-label">START</div><input className="field-input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
                    <div className="settings-field"><div className="field-label">END</div><input className="field-input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
                    <div className="settings-field"><div className="field-label">DATE</div><input className="field-input" type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} /></div>
                  </div>
                  <div className="field-label" style={{ marginBottom:6 }}>MINS PER STOP</div>
                  <div className="chips-row" style={{ marginBottom:10 }}>
                    {MINS_OPTIONS.map(m => <button key={m} className={`chip ${defaultMins===m?"active":""}`} onClick={() => setDefaultMins(m)}>{minsLabel(m)}</button>)}
                  </div>
                  <div className="field-label" style={{ marginBottom:6 }}>DEFAULT DRIVE TIME</div>
                  <div className="chips-row">
                    {DRIVE_OPTIONS.map(m => <button key={m} className={`chip ${defaultDrive===m?"active":""}`} onClick={() => setDefaultDrive(m)}>{minsLabel(m)}</button>)}
                  </div>

                  {/* Timeline */}
                  {scheduled.length > 0 && (
                    <div className="timeline">
                      {scheduled.map((stop, i) => {
                        const st     = STOP_TYPES[stop.type] || STOP_TYPES.garage;
                        const isNow  = stop.arriveAt <= nowMins && nowMins < stop.leaveAt;
                        const dotCol = stop.status==="visited"?"#22c55e":stop.status==="skip"?"#6b7280":st.color;
                        const tooEarly = stop.open_time && stop.arriveAt < timeToMins(stop.open_time);
                        const isOverridden = stop.drive_override != null;
                        return (
                          <React.Fragment key={stop.id}>
                            <div className="tl-row">
                              <div className={`tl-time ${isNow?"now":""}`}>{minsToTime(stop.arriveAt)}</div>
                              <div className="tl-spine">
                                <div className="tl-dot" style={{ background: dotCol }}/>
                                {(i < scheduled.length - 1) && <div className="tl-line"/>}
                              </div>
                              <div className="tl-content">
                                <div className={`tl-name ${isNow?"is-now":""}`}>{st.emoji} {stop.name}</div>
                                <div className="tl-meta">
                                  {minsLabel(stop.est_minutes || defaultMins)}
                                  {stop.open_time && <span> · {minsToTime(timeToMins(stop.open_time))}{stop.close_time?`–${minsToTime(timeToMins(stop.close_time))}`:"+"}</span>}
                                  {tooEarly && <span className="tl-warn"> ⚠️ Opens later</span>}
                                </div>
                              </div>
                            </div>
                            {i < scheduled.length - 1 && (
                              <div className="tl-drive-row">
                                <div className="tl-drive-label" style={{ paddingLeft: 68 }}>
                                  🚗 {minsLabel(stop.driveToNext)}{isOverridden ? " (override)" : " (est.)"}
                                </div>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                      <div className="tl-end">
                        <div className="tl-end-time">{minsToTime(timeToMins(endTime))}</div>
                        <div style={{width:18,display:"flex",justifyContent:"center"}}><div className="tl-end-dot"/></div>
                        <div className="tl-end-label" style={{paddingLeft:6}}>Done for the day</div>
                      </div>
                    </div>
                  )}

                  {dayStatus && stops.length > 0 && (
                    <div className={`day-status ${dayStatus.type}`}>
                      {dayStatus.type==="ahead"?"✅":dayStatus.type==="behind"?"⚠️":"👌"} {dayStatus.msg}
                    </div>
                  )}
                </div>

                {/* Add / Edit stop */}
                <div className="add-card">
                  <div className="section-label">{editingStop ? "EDIT STOP" : "ADD A STOP"}</div>
                  <div className="type-row">
                    {Object.entries(STOP_TYPES).map(([k,v]) => (
                      <button key={k} className={`type-chip ${newType===k?"active":""}`}
                        style={{ background:newType===k?v.color:"none", color:newType===k?"#0c0c10":"var(--muted)", borderColor:newType===k?v.color:"var(--border)" }}
                        onClick={() => setNewType(k)}
                      >{v.emoji} {v.label}</button>
                    ))}
                  </div>
                  <input className="add-input" placeholder="Name (e.g. Johnson Estate)" value={newName} onChange={e => setNewName(e.target.value)} />
                  <input className="add-input" placeholder="Address (e.g. 123 Oak St, Hoover AL)" value={newAddr} onChange={e => setNewAddr(e.target.value)}
                    onKeyDown={e => e.key==="Enter" && saveStop(newAddr, newName, newType, newOpen, newClose, editingStop?.id)}
                  />
                  <div className="two-col">
                    <div className="settings-field"><div className="field-label">OPENS (optional)</div><input className="field-input" type="time" value={newOpen} onChange={e => setNewOpen(e.target.value)} /></div>
                    <div className="settings-field"><div className="field-label">CLOSES (optional)</div><input className="field-input" type="time" value={newClose} onChange={e => setNewClose(e.target.value)} /></div>
                  </div>
                  <div className="add-actions">
                    {editingStop && (
                      <button className="add-btn cancel-edit" onClick={() => { setEditingStop(null); setNewAddr(""); setNewName(""); setNewOpen(""); setNewClose(""); }}>
                        Cancel
                      </button>
                    )}
                    <button className="add-btn" onClick={() => saveStop(newAddr, newName, newType, newOpen, newClose, editingStop?.id)} disabled={adding || !newAddr.trim()}>
                      {adding ? "…" : editingStop ? "SAVE CHANGES" : "+ ADD STOP"}
                    </button>
                    {!editingStop && <button className="paste-btn" onClick={() => setPasteModal(true)}>📋 PASTE LIST</button>}
                  </div>
                </div>

                {/* Stops list */}
                {stops.length > 0 && (
                  <>
                    <div className="stops-header">
                      <span className="stops-header-label">YOUR STOPS</span>
                      <div className="stops-header-actions">
                        <button className="sort-btn" onClick={sortByRoute}>🗺️ Sort Route</button>
                        <button className="clear-all-btn" onClick={() => { if (!window.confirm(`Clear all ${stops.length} stops?`)) return; if (connected) sbFetch(`/hunt_stops?session_date=eq.${sessionDate}`,{method:"DELETE"}).catch(()=>{}); setStops([]); }}>CLEAR ALL</button>
                      </div>
                    </div>

                    {(() => {
                      const activeStops = scheduled.filter(s => s.status === "pending");
                      const doneStops   = scheduled.filter(s => s.status !== "pending");
                      return (<>
                      {activeStops.map((stop) => {
                      const realIdx = scheduled.findIndex(s => s.id === stop.id);
                      const st     = STOP_TYPES[stop.type] || STOP_TYPES.garage;
                      const ms     = STOP_STATUS[stop.status] || STOP_STATUS.pending;
                      const isOpen = expandedId === stop.id;
                      const tooEarly = stop.open_time && stop.arriveAt < timeToMins(stop.open_time);
                      return (
                        <div key={stop.id} className={`stop-card ${stop.status}`} style={{ borderColor:isOpen?st.color+"55":undefined }}>
                          <div className="stop-main" onClick={() => isOpen ? setExpandedId(null) : expandStop(stop)}>
                            <div className="stop-order-num">{realIdx+1}</div>
                            <div className="stop-emoji">{st.emoji}</div>
                            <div className="stop-info">
                              <div className="stop-name">{stop.name}</div>
                              <div className="stop-addr">{stop.address}</div>
                              <div className="stop-pills">
                                <span className="pill pill-time">{minsToTime(stop.arriveAt)}</span>
                                <span className="pill pill-status" style={{ background:ms.color+"22", color:ms.color }}>{ms.emoji} {ms.label}</span>
                                {stop.open_time && <span className="pill pill-hours">{minsToTime(timeToMins(stop.open_time))}{stop.close_time?`–${minsToTime(timeToMins(stop.close_time))}`:"+"}</span>}
                                {tooEarly && <span className="pill pill-warn">⚠️ Opens later</span>}
                                {stop.notes ? <span className="pill pill-note">"{stop.notes}"</span> : null}
                              </div>
                            </div>
                            <div className="reorder-btns" onClick={e => e.stopPropagation()}>
                              <button className="reorder-btn" onClick={() => moveStop(realIdx, -1)} disabled={realIdx===0}>↑</button>
                              <button className="reorder-btn" onClick={() => moveStop(realIdx, 1)} disabled={realIdx===stops.length-1}>↓</button>
                            </div>
                            <span className={`stop-chevron ${isOpen?"open":""}`}>›</span>
                          </div>

                          {isOpen && (
                            <div className="stop-expanded">
                              <div className="status-btns">
                                {Object.entries(STOP_STATUS).map(([k,v]) => (
                                  <button key={k} className="status-btn" style={{ borderColor:v.color, color:v.color, background:stop.status===k?v.color+"22":"none" }} onClick={() => updateStop(stop.id,{status:k})}>
                                    <span className="status-btn-emoji">{v.emoji}</span>
                                    <span className="status-btn-label">{v.label}</span>
                                  </button>
                                ))}
                              </div>
                              <div className="expand-two">
                                <div className="expand-field">
                                  <div className="field-label">MINS HERE</div>
                                  <div className="chips-row">
                                    {MINS_OPTIONS.map(m => <button key={m} className={`chip ${(stop.est_minutes||defaultMins)===m?"active":""}`} onClick={() => updateStop(stop.id,{est_minutes:m})}>{minsLabel(m)}</button>)}
                                  </div>
                                </div>
                              </div>
                              <div className="expand-field">
                                <div className="field-label">DRIVE TO NEXT STOP (override)</div>
                                <div className="chips-row">
                                  <button className={`chip ${stop.drive_override==null?"active":""}`} onClick={() => updateStop(stop.id,{drive_override:null})}>Auto</button>
                                  {DRIVE_OPTIONS.map(m => <button key={m} className={`chip ${stop.drive_override===m?"active":""}`} onClick={() => updateStop(stop.id,{drive_override:m})}>{minsLabel(m)}</button>)}
                                </div>
                              </div>
                              <textarea className="stop-notes-input" rows={2} placeholder="Notes… (cash only, lots of tools, Pete says good stuff)" value={stop.notes||""} onChange={e => updateStop(stop.id,{notes:e.target.value})} />
                              <div className="stop-actions">
                                <button className="s-btn nav-s" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`,"_blank")}>🧭 Navigate</button>
                                <button className="s-btn edit-s" onClick={() => { startEdit(stop); setExpandedId(null); }}>✏️ Edit</button>
                                <button className="s-btn" onClick={() => { navigator.clipboard?.writeText(stop.address); showToast("Copied!"); }}>📋 Copy</button>
                                <button className="s-btn danger" onClick={() => deleteStop(stop.id)}>🗑</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {doneStops.length > 0 && (
                      <>
                        <button onClick={() => setShowDone(p=>!p)} style={{ width:"100%", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, padding:"10px 14px", color:"var(--muted)", fontFamily:"'DM Mono',monospace", fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", letterSpacing:0.5 }}>
                          <span>✅ {doneStops.length} {doneStops.length===1?"stop":"stops"} done</span>
                          <span>{showDone?"▲":"▼"}</span>
                        </button>
                        {showDone && doneStops.map((stop) => {
                          const realIdx = scheduled.findIndex(s => s.id === stop.id);
                          const st     = STOP_TYPES[stop.type] || STOP_TYPES.garage;
                          const ms     = STOP_STATUS[stop.status] || STOP_STATUS.pending;
                          const isOpen = expandedId === stop.id;
                          const tooEarly = stop.open_time && stop.arriveAt < timeToMins(stop.open_time);
                          return (
                            <div key={stop.id} className={`stop-card ${stop.status}`} style={{ borderColor:isOpen?st.color+"55":undefined, opacity:0.7 }}>
                              <div className="stop-main" onClick={() => isOpen ? setExpandedId(null) : expandStop(stop)}>
                                <div className="stop-order-num">{realIdx+1}</div>
                                <div className="stop-emoji">{st.emoji}</div>
                                <div className="stop-info">
                                  <div className="stop-name">{stop.name}</div>
                                  <div className="stop-addr">{stop.address}</div>
                                  <div className="stop-pills">
                                    <span className="pill pill-time">{minsToTime(stop.arriveAt)}</span>
                                    <span className="pill pill-status" style={{ background:ms.color+"22", color:ms.color }}>{ms.emoji} {ms.label}</span>
                                  </div>
                                </div>
                                <span className={`stop-chevron ${isOpen?"open":""}`}>›</span>
                              </div>
                              {isOpen && (
                                <div className="stop-expanded">
                                  <div className="status-btns">
                                    {Object.entries(STOP_STATUS).map(([k,v]) => (
                                      <button key={k} className="status-btn" style={{ borderColor:v.color, color:v.color, background:stop.status===k?v.color+"22":"none" }} onClick={() => updateStop(stop.id,{status:k})}>
                                        <span className="status-btn-emoji">{v.emoji}</span>
                                        <span className="status-btn-label">{v.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                  <div className="stop-actions">
                                    <button className="s-btn nav-s" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`,"_blank")}>🧭 Navigate</button>
                                    <button className="s-btn danger" onClick={() => deleteStop(stop.id)}>🗑 Remove</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                    </>);})()}
                  </>
                )}

                {stops.length === 0 && (
                  <div className="empty">
                    <span className="empty-icon">🗓</span>
                    <div className="empty-text">No stops yet.<br/>Add addresses from estatesales.net,<br/>Facebook, or Craigslist above.</div>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* ══ MAP TAB ══ */}
          {activeTab === "map" && (
            <div className="page map-page">
              <LeafletMap
                userPos={userPos}
                gpsReady={gpsReady}
                stops={scheduled}
                mapPins={mapPins}
                nowMins={nowMins}
                onMarkClick={handleMark}
                onStopClick={(stop) => { setActiveTab("plan"); expandStop(stop); }}
                onPinClick={(pin) => { setEditPin(pin); setMapSheet("editPin"); }}
                onClearPins={() => { if(window.confirm("Clear on-the-fly pins?")) setMapPins([]); }}
              />

              {mapSheet === "pickLocation" && (
                <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setMapSheet(null)}>
                  <div className="sheet">
                    <div className="sheet-handle"/>
                    <div className="sheet-title">WHERE IS THIS HOUSE?</div>
                    <div style={{display:"flex",gap:10,marginBottom:8}}>
                      <button className="sh-btn" style={{borderColor:"#f59e0b",color:"#f59e0b",flex:1,padding:"18px 8px"}}
                        onClick={() => {
                          if (gpsReady && userPos) { setPending(userPos); setMapSheet("new"); }
                          else setMapSheet("noGps");
                        }}>
                        <span className="sh-emoji">📍</span>
                        <span className="sh-label">HERE</span>
                        <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(245,158,11,0.6)",marginTop:2}}>current location</span>
                      </button>
                      <button className="sh-btn" style={{borderColor:"#60a5fa",color:"#60a5fa",flex:1,padding:"18px 8px"}}
                        onClick={() => setMapSheet("noGps")}>
                        <span className="sh-emoji">🗺️</span>
                        <span className="sh-label">PAST SPOT</span>
                        <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(96,165,250,0.6)",marginTop:2}}>enter address</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {mapSheet === "new" && (
                <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setMapSheet(null)}>
                  <div className="sheet">
                    <div className="sheet-handle"/>
                    <div className="sheet-title">MARK THIS HOUSE</div>
                    <div className="sheet-status-row">
                      {Object.entries(STOP_STATUS).map(([k,v]) => (
                        <button key={k} className="sh-btn" style={{borderColor:v.color,color:v.color}} onClick={()=>confirmPin(k)}>
                          <span className="sh-emoji">{v.emoji}</span><span className="sh-label">{v.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {mapSheet === "editPin" && editPin && (
                <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setMapSheet(null)}>
                  <div className="sheet">
                    <div className="sheet-handle"/>
                    <div className="sheet-title">UPDATE THIS HOUSE</div>
                    <div className="sheet-status-row">
                      {Object.entries(STOP_STATUS).map(([k,v]) => (
                        <button key={k} className="sh-btn" style={{borderColor:v.color,color:v.color,background:editPin.status===k?v.color+"22":"none"}} onClick={()=>updatePin(editPin.id,k)}>
                          <span className="sh-emoji">{v.emoji}</span><span className="sh-label">{v.label}</span>
                        </button>
                      ))}
                    </div>
                    <button className="sh-del-btn" onClick={()=>deletePin(editPin.id)}>🗑 Remove this pin</button>
                  </div>
                </div>
              )}

              {mapSheet === "noGps" && (
                <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setMapSheet(null)}>
                  <div className="sheet">
                    <div className="sheet-handle"/>
                    <div className="no-gps-title">GPS not available</div>
                    <div className="no-gps-sub">Enable location in your browser, or type an address to drop a pin manually.</div>
                    <input className="addr-input" placeholder="123 Oak St, Birmingham AL" value={manualAddr} onChange={e=>setManual(e.target.value)} onKeyDown={e=>e.key==="Enter"&&geocodeManual()} autoFocus />
                    <button className="primary-btn" onClick={geocodeManual} disabled={geocoding||!manualAddr.trim()}>{geocoding?"Finding…":"Drop Pin Here"}</button>
                    <button className="cancel-btn" onClick={()=>setMapSheet(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <nav className="bottom-nav">
          <button className={`nav-btn ${activeTab==="plan"?"active":""}`} onClick={()=>setActiveTab("plan")}>
            <span className="nav-icon">📋</span><span className="nav-label">PLAN</span>
          </button>
          <button className={`nav-btn ${activeTab==="map"?"map-active":""}`} onClick={()=>setActiveTab("map")}>
            <span className="nav-icon">🗺️</span><span className="nav-label">MAP</span>
          </button>
        </nav>

        {pasteModal && (
          <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setPasteModal(false)}>
            <div className="sheet">
              <div className="sheet-handle"/>
              <div style={{fontSize:16,fontWeight:700,color:"var(--text)",marginBottom:6}}>Paste Addresses</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"var(--muted)",lineHeight:1.6,marginBottom:12}}>One address per line — works with estatesales.net, Facebook, Craigslist.</div>
              <textarea className="paste-area" rows={7} placeholder={"123 Oak St, Birmingham AL\n456 Maple Ave, Hoover AL"} value={pasteText} onChange={e=>setPasteText(e.target.value)} autoFocus />
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
