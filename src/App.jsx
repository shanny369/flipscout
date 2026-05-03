import React, { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════════
const SUPABASE_URL      = "https://wiwftjtaclrwdxgcrffk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpd2Z0anRhY2xyd2R4Z2NyZmZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjIyNTYsImV4cCI6MjA5MDI5ODI1Nn0.EKQL7I62SCPnOPcOI__0yeFDgruPuDbu3xEl_138iZU";

// SQL to run once in Supabase:
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
//   drive_override integer default null,
//   group_name text default null,
//   sort_order integer default 0,
//   created_at timestamptz default now()
// );
// alter table hunt_stops add column if not exists group_name text default null;
// alter table hunt_stops add column if not exists drive_override integer default null;

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE
// ═══════════════════════════════════════════════════════════════════════════════
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

async function geocodeAddress(address) {
  try {
    const r = await fetch(`/api/claude?type=geocode&address=${encodeURIComponent(address)}`);
    const d = await r.json();
    if (d[0]) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
  } catch {}
  return null;
}

function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function estimateDrive(miles) {
  if (miles < 0.5) return 3;
  if (miles < 2)   return Math.round(miles * 4);
  if (miles < 10)  return Math.round(miles * 2.5);
  return Math.round(miles * 2);
}

function getTodayKey() { return new Date().toISOString().slice(0, 10); }
function getNowMins()  { const n = new Date(); return n.getHours()*60 + n.getMinutes(); }

function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minsToTime(m) {
  const h = Math.floor(m/60) % 24;
  const min = m % 60;
  return `${h%12||12}:${min.toString().padStart(2,"0")} ${h>=12?"PM":"AM"}`;
}

function minsLabel(m) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m/60), min = m%60;
  return min ? `${h}h ${min}m` : `${h}h`;
}

function buildSchedule(stops, startTime, defaultMins, defaultDrive) {
  let cursor = timeToMins(startTime) || timeToMins("08:00");
  return stops.map((stop, i) => {
    const arriveAt = cursor;
    const dur = stop.est_minutes || defaultMins;
    let drive = defaultDrive;
    if (stop.drive_override != null) {
      drive = stop.drive_override;
    } else if (stop.lat && stop.lng && i < stops.length - 1) {
      const next = stops[i+1];
      if (next?.lat && next?.lng) drive = estimateDrive(distanceMiles(stop.lat, stop.lng, next.lat, next.lng));
    }
    cursor += dur + (i < stops.length-1 ? drive : 0);
    return { ...stop, arriveAt, leaveAt: arriveAt+dur, driveToNext: drive };
  });
}

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

const MINS_OPTIONS  = [10, 15, 20, 30, 45, 60, 90, 120];
const DRIVE_OPTIONS = [3, 5, 10, 15, 20, 30, 45, 60];

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body,#root{height:100%;background:#0c0c10}
  body{font-family:'DM Sans',sans-serif;color:#e8e8f0;-webkit-tap-highlight-color:transparent}
  :root{
    --bg:#0c0c10;--surface:#13131a;--s2:#1a1a24;--border:#252535;
    --accent:#f59e0b;--text:#e8e8f0;--muted:#60607a;--green:#22c55e;--red:#f43f5e;
  }
  .shell{height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden;max-width:520px;margin:0 auto}

  /* HEADER */
  .hdr{background:var(--bg);border-bottom:1px solid var(--border);padding:11px 16px 10px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
  .logo{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:3px;line-height:1}
  .logo span{color:var(--accent)}
  .hdr-r{display:flex;align-items:center;gap:8px}
  .sdot{width:7px;height:7px;border-radius:50%;background:#6b7280;flex-shrink:0}
  .sdot.live{background:#22c55e;animation:sp 2s ease-in-out infinite}
  @keyframes sp{0%,100%{opacity:1}50%{opacity:0.4}}
  .dbadge{font-family:'DM Mono',monospace;font-size:11px;color:var(--muted)}

  /* NAV */
  .bnav{display:flex;background:#0a0a0e;border-top:1px solid var(--border);flex-shrink:0;z-index:200}
  .nbtn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 0 16px;background:none;border:none;cursor:pointer;color:var(--muted);transition:color 0.15s}
  .nbtn.on{color:var(--accent)}
  .nbtn.mapon{color:#60a5fa}
  .nicon{font-size:20px;line-height:1}
  .nlabel{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:1px}

  /* PAGES */
  .page{flex:1;overflow-y:auto;min-height:0}
  .mappage{overflow:hidden;display:flex;flex-direction:column}
  .planwrap{padding:10px 10px 80px;display:flex;flex-direction:column;gap:9px}

  /* STATS */
  .stats{display:flex;gap:6px}
  .sc{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px 4px;text-align:center;min-width:0}
  .sn{font-family:'Bebas Neue',sans-serif;font-size:24px;line-height:1}
  .sn.a{color:var(--accent)}.sn.g{color:var(--green)}.sn.gr{color:#6b7280}
  .sl{font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-top:2px}

  /* CARDS */
  .card{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:12px;overflow:hidden}
  .clabel{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:2px;color:var(--muted);margin-bottom:9px}
  .srow{display:flex;gap:7px;margin-bottom:9px}
  .sf{flex:1;min-width:0}
  .fl{font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);letter-spacing:0.5px;margin-bottom:3px}
  .fi{width:100%;background:var(--s2);border:1px solid var(--border);border-radius:7px;padding:7px 8px;color:var(--text);font-family:'DM Mono',monospace;font-size:12px;outline:none;transition:border-color 0.2s}
  .fi:focus{border-color:var(--accent)}
  .chips{display:flex;gap:5px;flex-wrap:wrap}
  .chip{padding:4px 10px;border-radius:20px;border:1px solid var(--border);background:none;color:var(--muted);font-family:'DM Mono',monospace;font-size:11px;cursor:pointer;transition:all 0.15s;white-space:nowrap}
  .chip.on{background:var(--accent);color:#0c0c10;border-color:var(--accent);font-weight:600}

  /* OVER-SCHEDULE WARNING */
  .overwarn{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:9px;font-family:'DM Mono',monospace;font-size:11px;margin-top:8px;background:rgba(244,63,94,0.1);color:var(--red);border:1px solid rgba(244,63,94,0.2)}
  .daystatus{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:9px;font-family:'DM Mono',monospace;font-size:11px;margin-top:8px}
  .daystatus.ahead{background:rgba(34,197,94,0.1);color:var(--green);border:1px solid rgba(34,197,94,0.2)}
  .daystatus.behind{background:rgba(244,63,94,0.1);color:var(--red);border:1px solid rgba(244,63,94,0.2)}
  .daystatus.ontrack{background:rgba(245,158,11,0.1);color:var(--accent);border:1px solid rgba(245,158,11,0.2)}

  /* TIMELINE — only named stops */
  .tl{display:flex;flex-direction:column;margin-top:11px}
  .tlr{display:flex;align-items:flex-start;position:relative}
  .tlt{font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);text-align:right;padding-right:7px;width:48px;flex-shrink:0;padding-top:1px;line-height:1.4}
  .tlt.now{color:var(--accent);font-weight:600}
  .tlsp{width:16px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;position:relative}
  .tldot{width:9px;height:9px;border-radius:50%;margin-top:2px;z-index:1;flex-shrink:0}
  .tlline{position:absolute;top:11px;bottom:0;width:2px;background:var(--border)}
  .tlc{flex:1;padding-bottom:4px;padding-left:5px;min-width:0}
  .tln{font-size:12px;font-weight:600;color:var(--text);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tln.now{color:var(--accent)}
  .tlm{font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tlwarn{color:var(--red)}
  .tldrive{padding:3px 0 3px 64px;font-family:'DM Mono',monospace;font-size:10px;color:var(--muted)}
  .tlend{display:flex;align-items:center}
  .tlendtime{font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);text-align:right;padding-right:7px;width:48px;flex-shrink:0}
  .tlenddot{width:9px;height:9px;border-radius:50%;background:var(--border);border:2px solid #3a3a4a;flex-shrink:0;margin-left:3px}
  .tlendlabel{font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);padding-left:7px}

  /* ADD FORM */
  .addcard{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:12px;overflow:hidden}
  .typerow{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}
  .tc{padding:4px 9px;border-radius:7px;border:1px solid var(--border);background:none;font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:3px;white-space:nowrap}
  .tc.on{color:#0c0c10;border-color:transparent;font-weight:600}
  .ai{width:100%;background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:9px 11px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;outline:none;transition:border-color 0.2s;margin-bottom:6px}
  .ai:focus{border-color:var(--accent)}
  .ai::placeholder{color:var(--muted)}
  .twocol{display:flex;gap:7px;margin-bottom:6px}
  .addrow{display:flex;gap:7px}
  .abtn{flex:1;padding:10px;background:var(--accent);color:#0c0c10;border:none;border-radius:8px;font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:2px;cursor:pointer;transition:all 0.15s}
  .abtn:hover:not(:disabled){background:#fbbf24}
  .abtn:disabled{opacity:0.4;cursor:not-allowed}
  .abtn.ghost{background:var(--s2);color:var(--muted);border:1px solid var(--border)}
  .pbtn{padding:10px 12px;background:none;border:1px solid var(--border);border-radius:8px;color:var(--muted);font-family:'DM Mono',monospace;font-size:11px;cursor:pointer;transition:all 0.15s;white-space:nowrap}
  .pbtn:hover{color:var(--text);border-color:var(--text)}

  /* STOP LIST */
  .listhdr{display:flex;align-items:center;justify-content:space-between;padding:0 2px}
  .listlabel{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:2px;color:var(--muted)}
  .listactions{display:flex;gap:10px;align-items:center}
  .routebtn{font-family:'DM Mono',monospace;font-size:10px;color:#60a5fa;background:none;border:none;cursor:pointer;padding:0}
  .clearallbtn{font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);background:none;border:none;cursor:pointer;padding:0}
  .clearallbtn:hover{color:var(--red)}

  /* GROUP HEADER */
  .grouphdr{background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:9px 12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;gap:8px}
  .groupname{font-family:'DM Mono',monospace;font-size:11px;color:var(--text);font-weight:600;letter-spacing:0.5px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .groupmeta{font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);white-space:nowrap;flex-shrink:0}
  .groupchev{color:var(--muted);font-size:14px;flex-shrink:0;transition:transform 0.2s}
  .groupchev.open{transform:rotate(90deg)}
  .groupchildren{display:flex;flex-direction:column;gap:6px;padding-left:12px}

  /* STOP CARD */
  .sc2{background:var(--surface);border:1px solid var(--border);border-radius:11px;overflow:hidden;transition:border-color 0.15s}
  .sc2.visited{border-color:rgba(34,197,94,0.35)}
  .sc2.skip{opacity:0.55}
  .smain{padding:10px 11px;display:flex;align-items:flex-start;gap:8px;cursor:pointer}
  .snum{font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);background:var(--s2);border-radius:4px;padding:2px 5px;flex-shrink:0;margin-top:1px}
  .semoji{font-size:18px;flex-shrink:0;line-height:1.1}
  .sinfo{flex:1;min-width:0;overflow:hidden}
  .sname{font-size:13px;font-weight:600;color:var(--text);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .saddr{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
  .spills{display:flex;align-items:center;gap:5px;margin-top:4px;flex-wrap:wrap}
  .pill{font-family:'DM Mono',monospace;font-size:10px;padding:2px 6px;border-radius:5px;white-space:nowrap}
  .pt{color:var(--accent);background:rgba(245,158,11,0.12)}
  .ph{color:#60a5fa;background:rgba(96,165,250,0.1)}
  .pw{color:var(--red);background:rgba(244,63,94,0.1)}
  .pn{color:var(--muted);font-style:italic;font-family:'DM Sans',sans-serif;max-width:100px;overflow:hidden;text-overflow:ellipsis}
  .schev{color:var(--muted);font-size:15px;transition:transform 0.2s;flex-shrink:0;margin-top:2px}
  .schev.open{transform:rotate(90deg)}
  .rbtns{display:flex;gap:3px;flex-shrink:0;margin-top:2px}
  .rbtn{width:22px;height:22px;border-radius:4px;border:1px solid var(--border);background:none;color:var(--muted);font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;padding:0}
  .rbtn:hover:not(:disabled){color:var(--text);border-color:var(--text)}
  .rbtn:disabled{opacity:0.2;cursor:not-allowed}

  .sexp{border-top:1px solid var(--border);padding:10px 11px;background:rgba(0,0,0,0.2);display:flex;flex-direction:column;gap:8px}
  .stbtns{display:flex;gap:7px}
  .stbtn{flex:1;padding:9px 4px;border-radius:9px;border:1.5px solid;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;transition:all 0.12s;min-width:0}
  .stbtn:active{transform:scale(0.95)}
  .stbe{font-size:18px;line-height:1}
  .stbl{font-family:'DM Mono',monospace;font-size:10px}
  .etwo{display:flex;gap:7px}
  .ef{flex:1;min-width:0}
  .sni{width:100%;background:var(--s2);border:1px solid var(--border);border-radius:7px;padding:8px 10px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:12px;outline:none;resize:none;transition:border-color 0.2s}
  .sni:focus{border-color:var(--accent)}
  .sni::placeholder{color:var(--muted)}
  .sacts{display:flex;gap:6px}
  .sa{flex:1;padding:7px 4px;border-radius:7px;border:1px solid var(--border);background:none;color:var(--muted);font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;transition:all 0.15s;text-align:center;white-space:nowrap}
  .sa:hover{color:var(--text);border-color:var(--text)}
  .sa.danger:hover{color:var(--red);border-color:var(--red)}
  .sa.nav{background:rgba(96,165,250,0.1);color:#60a5fa;border-color:rgba(96,165,250,0.25)}
  .sa.edit{background:rgba(245,158,11,0.1);color:var(--accent);border-color:rgba(245,158,11,0.25)}

  /* DONE TOGGLE */
  .donetoggle{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 13px;color:var(--muted);font-family:'DM Mono',monospace;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;letter-spacing:0.5px}

  /* EMPTY */
  .empty{text-align:center;padding:36px 20px;color:var(--muted)}
  .eicon{font-size:40px;margin-bottom:10px;display:block}
  .etxt{font-size:13px;line-height:1.6}

  /* MAP */
  .mapouter{flex:1;position:relative;overflow:hidden;min-height:0;display:flex;flex-direction:column;padding-bottom:100px}
  .mapinner{flex:1;min-height:0}
  .maplegend{position:absolute;top:10px;left:10px;z-index:100;background:rgba(10,10,14,0.92);border:1px solid #2a2a3a;border-radius:9px;padding:7px 11px;backdrop-filter:blur(10px);display:flex;flex-direction:column;gap:4px}
  .legrow{display:flex;align-items:center;gap:6px;font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,0.6)}
  .legdot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .mapclear{position:absolute;top:10px;right:10px;z-index:100;background:rgba(10,10,14,0.92);border:1px solid #2a2a3a;border-radius:7px;padding:6px 11px;color:rgba(255,255,255,0.4);font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;backdrop-filter:blur(10px);transition:all 0.15s}
  .mapclear:hover{color:var(--red);border-color:var(--red)}
  .gpspill{position:absolute;bottom:108px;right:10px;z-index:100;background:rgba(10,10,14,0.92);border:1px solid #2a2a3a;border-radius:20px;padding:5px 11px;font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,0.4);backdrop-filter:blur(10px);display:flex;align-items:center;gap:5px}
  .gdot{width:6px;height:6px;border-radius:50%;background:#6b7280}
  .gdot.on{background:#22c55e;animation:gp 1.6s ease-in-out infinite}
  @keyframes gp{0%,100%{opacity:1}50%{opacity:0.3}}

  /* BOTTOM STRIP — always visible */
  .mapstrip{position:fixed;bottom:0;left:0;right:0;z-index:9999;background:rgba(10,10,14,0.99);border-top:1px solid #2a2a3a;padding:9px 10px 20px;backdrop-filter:blur(12px);max-width:520px}
  .stripinner{display:flex;align-items:center;gap:10px}
  .markbtn{width:60px;height:60px;border-radius:50%;background:var(--accent);border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;box-shadow:0 4px 20px rgba(245,158,11,0.5);transition:transform 0.1s;flex-shrink:0}
  .markbtn:active{transform:scale(0.92)}
  .markicon{font-size:22px;line-height:1}
  .marklabel{font-family:'DM Mono',monospace;font-size:9px;font-weight:600;color:#0c0c10;letter-spacing:1px}
  .stripright{flex:1;min-width:0}
  .striphint{font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:0.5px;margin-bottom:5px}
  .striplist{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}
  .stripstop{flex-shrink:0;min-width:95px;max-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 8px;cursor:pointer;transition:border-color 0.15s;overflow:hidden}
  .stripstop.now{border-color:var(--accent)}
  .stripstop.done{opacity:0.45}
  .stripname{font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}
  .stripmeta{display:flex;align-items:center;justify-content:space-between;gap:3px}
  .striptime{font-family:'DM Mono',monospace;font-size:10px;color:var(--accent)}

  /* SHEETS */
  .backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:500;display:flex;align-items:flex-end}
  .sheet{width:100%;background:#161620;border-radius:20px 20px 0 0;padding:13px 18px 46px;animation:sup 0.2s cubic-bezier(0.34,1.3,0.64,1);max-height:80vh;overflow-y:auto}
  @keyframes sup{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
  .shandle{width:36px;height:4px;background:#2a2a3a;border-radius:2px;margin:0 auto 14px}
  .stitle{font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);letter-spacing:2px;text-align:center;margin-bottom:14px}
  .sstrow{display:flex;gap:9px}
  .sstbtn{flex:1;padding:14px 4px;border-radius:11px;border:2px solid;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:5px;transition:transform 0.1s}
  .sstbtn:active{transform:scale(0.94)}
  .sse{font-size:24px;line-height:1}
  .ssl{font-family:'DM Mono',monospace;font-size:10px}
  .sdelbtn{width:100%;margin-top:10px;padding:11px;background:none;border:1px solid #2a2a3a;border-radius:9px;color:#555;font-family:'DM Mono',monospace;font-size:12px;cursor:pointer;transition:all 0.15s}
  .sdelbtn:hover{border-color:var(--red);color:var(--red)}
  .nogpstitle{font-size:16px;font-weight:700;color:var(--text);margin-bottom:7px}
  .nogpssub{font-family:'DM Mono',monospace;font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:13px}
  .addrinput{width:100%;background:#0c0c10;border:1.5px solid #2a2a3a;border-radius:9px;padding:11px 13px;color:var(--text);font-family:'DM Mono',monospace;font-size:13px;outline:none;margin-bottom:9px;transition:border-color 0.2s}
  .addrinput:focus{border-color:var(--accent)}
  .addrinput::placeholder{color:#333}
  .primebtn{width:100%;padding:12px;background:var(--accent);color:#0c0c10;border:none;border-radius:9px;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;cursor:pointer}
  .primebtn:disabled{opacity:0.4;cursor:not-allowed}
  .cancelbtn{width:100%;padding:9px;background:none;border:none;color:var(--muted);font-family:'DM Mono',monospace;font-size:12px;cursor:pointer;margin-top:5px}
  .pastearea{width:100%;background:#0c0c10;border:1.5px solid #2a2a3a;border-radius:9px;padding:11px 13px;color:var(--text);font-family:'DM Mono',monospace;font-size:12px;outline:none;resize:none;margin-bottom:10px;transition:border-color 0.2s;line-height:1.6}
  .pastearea:focus{border-color:var(--accent)}
  .modalacts{display:flex;gap:9px}
  .ghostbtn{padding:12px 16px;background:none;border:1px solid var(--border);border-radius:9px;color:var(--muted);font-family:'DM Mono',monospace;font-size:12px;cursor:pointer}
  .groupnameinput{width:100%;background:#0c0c10;border:1.5px solid #2a2a3a;border-radius:9px;padding:10px 13px;color:var(--text);font-family:'DM Mono',monospace;font-size:13px;outline:none;margin-bottom:9px;transition:border-color 0.2s}
  .groupnameinput:focus{border-color:var(--accent)}
  .groupnameinput::placeholder{color:#444}

  /* TOAST */
  .toast{position:fixed;bottom:75px;left:50%;transform:translateX(-50%);background:#1e1e2e;border:1px solid #2a2a3a;color:var(--text);padding:8px 16px;border-radius:20px;font-family:'DM Mono',monospace;font-size:11px;z-index:999;white-space:nowrap;animation:tin 0.18s ease;pointer-events:none}
  @keyframes tin{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// LEAFLET MAP
// ═══════════════════════════════════════════════════════════════════════════════
function LeafletMap({ userPos, gpsReady, stops, mapPins, nowMins, onMarkClick, onPinStatusChange, onPinDelete, onStopStatusChange }) {
  const mapDivRef  = useRef(null);
  const leafletRef = useRef(null);
  const initRef    = useRef(false);
  const markersRef = useRef([]);
  const userMkrRef = useRef(null);
  const stopsKey   = useRef("");

  // Init once
  useEffect(() => {
    if (initRef.current || !mapDivRef.current) return;
    initRef.current = true;

    if (!document.getElementById("lcss")) {
      const l = document.createElement("link");
      l.id = "lcss"; l.rel = "stylesheet";
      l.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(l);
    }

    const init = () => {
      const L = window.L;
      if (!L || !mapDivRef.current) return;
      const center = userPos ? [userPos.lat, userPos.lng] : [33.4, -86.8];
      const map = L.map(mapDivRef.current, { zoomControl: true, attributionControl: false }).setView(center, 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      leafletRef.current = map;
    };

    if (window.L) init();
    else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      s.onload = init;
      document.head.appendChild(s);
    }
    return () => { if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; initRef.current = false; } };
  }, []);

  // Invalidate size
  useEffect(() => {
    const t = setTimeout(() => leafletRef.current?.invalidateSize(), 200);
    return () => clearTimeout(t);
  });

  // Update user dot
  useEffect(() => {
    const L = window.L, map = leafletRef.current;
    if (!L || !map || !userPos) return;
    if (userMkrRef.current) { userMkrRef.current.setLatLng([userPos.lat, userPos.lng]); }
    else {
      const icon = L.divIcon({ html: '<div style="width:14px;height:14px;border-radius:50%;background:#60a5fa;border:2px solid #fff;box-shadow:0 0 8px rgba(96,165,250,0.7)"></div>', iconSize:[14,14], iconAnchor:[7,7], className:"" });
      userMkrRef.current = L.marker([userPos.lat, userPos.lng], { icon }).addTo(map);
      map.setView([userPos.lat, userPos.lng], 16);
    }
  }, [userPos]);

  // Update markers — stable, only re-render when stops/pins actually change
  useEffect(() => {
    const L = window.L, map = leafletRef.current;
    if (!L || !map) return;

    const renderAll = (resolvedStops) => {
      markersRef.current.forEach(m => map.removeLayer(m));
      markersRef.current = [];

      // Planned stop markers
      resolvedStops.filter(s => s.lat && s.lng).forEach(stop => {
        const st  = STOP_TYPES[stop.type] || STOP_TYPES.garage;
        const col = stop.status === "pending" ? st.color : (STOP_STATUS[stop.status]?.color ?? st.color);
        const icon = L.divIcon({
          html: `<div style="width:28px;height:32px"><svg width="28" height="32" viewBox="0 0 28 32"><path d="M14,30 C9,22 2,18 2,11 A12,12 0 1,1 26,11 C26,18 19,22 14,30Z" fill="${col}" stroke="white" stroke-width="2"/><text x="14" y="12" text-anchor="middle" dominant-baseline="middle" font-size="10">${st.emoji}</text></svg></div>`,
          iconSize:[28,32], iconAnchor:[14,30], className:""
        });
        const m = L.marker([stop.lat, stop.lng], { icon }).addTo(map);
        m.on("click", () => onStopStatusChange(stop));
        markersRef.current.push(m);
      });

      // On-the-fly pins
      mapPins.forEach(pin => {
        const col   = STOP_STATUS[pin.status]?.color ?? "#f59e0b";
        const emoji = STOP_STATUS[pin.status]?.emoji ?? "📍";
        const icon  = L.divIcon({
          html: `<div style="width:24px;height:24px;border-radius:50%;background:${col};border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:10px;box-shadow:0 2px 6px rgba(0,0,0,0.4)">${emoji}</div>`,
          iconSize:[24,24], iconAnchor:[12,12], className:""
        });
        const m = L.marker([pin.lat, pin.lng], { icon }).addTo(map);
        m.on("click", () => onPinStatusChange(pin));
        markersRef.current.push(m);
      });
    };

    // Only re-geocode if stops changed
    const key = stops.map(s => `${s.id}-${s.status}-${s.lat}`).join("|") + mapPins.map(p => `${p.id}-${p.status}`).join("|");
    if (key === stopsKey.current) return;
    stopsKey.current = key;

    const missing = stops.filter(s => !s.lat || !s.lng);
    if (!missing.length) { renderAll(stops); return; }

    Promise.all(stops.map(async s => {
      if (s.lat && s.lng) return s;
      const geo = await geocodeAddress(s.address);
      return geo ? { ...s, ...geo } : s;
    })).then(resolved => {
      renderAll(resolved);
      if (!userPos) {
        const first = resolved.find(s => s.lat && s.lng);
        if (first) map.setView([first.lat, first.lng], 14);
      }
    });
  }, [stops, mapPins, onStopStatusChange, onPinStatusChange, userPos]);

  // Named stops only for the strip
  const namedStops = stops.filter(s => s.type !== "house");

  return (
    <div className="mapouter">
      <div ref={mapDivRef} className="mapinner" />

      <div className="maplegend">
        {Object.entries(STOP_STATUS).map(([k,v]) => (
          <div className="legrow" key={k}><div className="legdot" style={{background:v.color}}/>{v.label}</div>
        ))}
      </div>

      {mapPins.length > 0 && <button className="mapclear" onClick={() => { if(window.confirm("Clear on-the-fly pins?")) onPinDelete("all"); }}>Clear pins</button>}
      <div className="gpspill"><div className={`gdot ${gpsReady?"on":""}`}/>{gpsReady?"GPS ready":"No GPS"}</div>

      <div className="mapstrip">
        <div className="stripinner">
          <button className="markbtn" onClick={onMarkClick}>
            <span className="markicon">📍</span>
            <span className="marklabel">MARK</span>
          </button>
          <div className="stripright">
            <div className="striphint">{gpsReady?"TAP TO MARK THIS HOUSE":"NO GPS — TAP FOR OPTIONS"}</div>
            {namedStops.length > 0 && (
              <div className="striplist">
                {namedStops.map(stop => {
                  const isNow = stop.arriveAt<=nowMins&&nowMins<stop.leaveAt;
                  const isDone = stop.status!=="pending";
                  return (
                    <div key={stop.id} className={`stripstop ${isNow?"now":""} ${isDone?"done":""}`} onClick={() => onStopStatusChange(stop)}>
                      <div className="stripname">{STOP_TYPES[stop.type]?.emoji} {stop.name}</div>
                      <div className="stripmeta">
                        <span className="striptime">{minsToTime(stop.arriveAt)}</span>
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
// MAP STATUS SHEET — shown on map without leaving tab
// ═══════════════════════════════════════════════════════════════════════════════
function MapStatusSheet({ target, type, onUpdate, onDelete, onClose }) {
  // type: "stop" | "pin"
  const name = target?.name || target?.address || "This house";
  return (
    <div className="backdrop" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="shandle"/>
        <div className="stitle">{type==="stop" ? name.toUpperCase() : "MARK THIS HOUSE"}</div>
        <div className="sstrow">
          {Object.entries(STOP_STATUS).map(([k,v]) => (
            <button key={k} className="sstbtn"
              style={{ borderColor:v.color, color:v.color, background:target?.status===k?v.color+"22":"none" }}
              onClick={() => onUpdate(k)}>
              <span className="sse">{v.emoji}</span>
              <span className="ssl">{v.label}</span>
            </button>
          ))}
        </div>
        {type==="pin" && <button className="sdelbtn" onClick={onDelete}>🗑 Remove this pin</button>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [activeTab, setActiveTab]       = useState("plan");
  const [stops, setStops]               = useState([]);
  const [sessionDate, setSessionDate]   = useState(getTodayKey());
  const [startTime, setStartTime]       = useState("08:00");
  const [endTime, setEndTime]           = useState("14:00");
  const [defaultMins, setDefaultMins]   = useState(20);
  const [defaultDrive, setDefaultDrive] = useState(10);
  const [connected, setConnected]       = useState(false);
  const [expandedId, setExpandedId]     = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [showDone, setShowDone]         = useState(false);
  const [editingStop, setEditingStop]   = useState(null);
  const [toast, setToast]               = useState(null);

  // Add form
  const [newName, setNewName]   = useState("");
  const [newAddr, setNewAddr]   = useState("");
  const [newType, setNewType]   = useState("garage");
  const [newOpen, setNewOpen]   = useState("");
  const [newClose, setNewClose] = useState("");
  const [adding, setAdding]     = useState(false);

  // Paste modal
  const [pasteModal, setPasteModal]   = useState(false);
  const [pasteText, setPasteText]     = useState("");
  const [pasteGroup, setPasteGroup]   = useState("");
  const [pasteMins, setPasteMins]     = useState(15);
  const [pasting, setPasting]         = useState(false);

  // Map
  const [userPos, setUserPos]       = useState(null);
  const [gpsReady, setGpsReady]     = useState(false);
  const [mapPins, setMapPins]       = useState([]);
  const [mapSheet, setMapSheet]     = useState(null); // "pickLocation"|"new"|"noGps"|"stopStatus"|"pinStatus"
  const [sheetTarget, setSheetTarget] = useState(null);
  const [pendingPos, setPending]    = useState(null);
  const [manualAddr, setManual]     = useState("");
  const [geocoding, setGeocoding]   = useState(false);
  const [nowMins, setNowMins]       = useState(getNowMins());

  const watchId  = useRef(null);
  const pollRef  = useRef(null);
  const clockRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2300); };

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
    pollRef.current = setInterval(loadStops, 10000);
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

  // ── STOP CRUD ──────────────────────────────────────────────────────────────
  const saveStop = async (address, name, type, openTime, closeTime, existingId = null, groupName = null, estMins = null) => {
    if (!address.trim()) return;
    setAdding(true);
    try {
      const geo = await geocodeAddress(address);
      const displayName = name.trim() || address.split(",")[0].trim();
      const patch = {
        name: displayName, address: address.trim(),
        lat: geo?.lat ?? null, lng: geo?.lng ?? null,
        type, open_time: openTime || null, close_time: closeTime || null,
        ...(groupName !== null ? { group_name: groupName } : {}),
        ...(estMins !== null ? { est_minutes: estMins } : {}),
      };

      if (existingId) {
        await sbFetch(`/hunt_stops?id=eq.${existingId}`, { method: "PATCH", body: JSON.stringify(patch) });
        setStops(p => p.map(s => s.id === existingId ? { ...s, ...patch } : s));
        showToast("✏️ Updated");
        setEditingStop(null);
      } else {
        const stop = { session_date: sessionDate, ...patch, notes: "", status: "pending", est_minutes: estMins ?? defaultMins, drive_override: null, sort_order: stops.length };
        if (connected) {
          const [created] = await sbFetch("/hunt_stops", { method: "POST", body: JSON.stringify(stop) });
          setStops(p => [...p, created]);
        } else {
          setStops(p => [...p, { ...stop, id: crypto.randomUUID(), created_at: new Date().toISOString() }]);
        }
        showToast(`📍 ${displayName}`);
      }
      setNewAddr(""); setNewName(""); setNewOpen(""); setNewClose("");
    } catch { showToast("⚠️ Couldn't save"); }
    finally { setAdding(false); }
  };

  const handlePaste = async () => {
    const lines = pasteText.split("\n").map(l => l.trim()).filter(l => l.length > 5);
    if (!lines.length) return;
    setPasting(true);
    const group = pasteGroup.trim() || null;
    for (const line of lines) {
      await saveStop(line, "", "community", "", "", null, group, pasteMins);
      await new Promise(r => setTimeout(r, 300));
    }
    setPasting(false); setPasteModal(false); setPasteText(""); setPasteGroup("");
    if (group) setExpandedGroups(p => ({ ...p, [group]: true }));
  };

  const updateStop = async (id, patch) => {
    setStops(p => p.map(s => s.id === id ? { ...s, ...patch } : s));
    if (connected) { try { await sbFetch(`/hunt_stops?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) }); } catch {} }
  };

  const deleteStop = async (id) => {
    setStops(p => p.filter(s => s.id !== id)); setExpandedId(null);
    if (connected) { try { await sbFetch(`/hunt_stops?id=eq.${id}`, { method: "DELETE" }); } catch {} }
  };

  const moveStop = (id, dir) => {
    const arr = [...stops];
    const idx = arr.findIndex(s => s.id === id);
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    const updated = arr.map((s, i) => ({ ...s, sort_order: i }));
    setStops(updated);
    if (connected) updated.forEach(s => sbFetch(`/hunt_stops?id=eq.${s.id}`, { method:"PATCH", body:JSON.stringify({ sort_order: s.sort_order }) }).catch(()=>{}));
  };

  const sortRemaining = () => {
    const pending = stops.filter(s => s.status==="pending" && s.lat && s.lng);
    const done    = stops.filter(s => s.status!=="pending");
    const noGeo   = stops.filter(s => s.status==="pending" && (!s.lat || !s.lng));
    if (pending.length < 2) { showToast("Need 2+ pending stops with addresses"); return; }
    const sorted = [pending[0]];
    const rem = pending.slice(1);
    while (rem.length) {
      const last = sorted[sorted.length-1];
      let ni = 0, nd = Infinity;
      rem.forEach((s,i) => { const d = distanceMiles(last.lat,last.lng,s.lat,s.lng); if(d<nd){nd=d;ni=i;} });
      sorted.push(rem.splice(ni,1)[0]);
    }
    const reordered = [...done, ...sorted, ...noGeo].map((s,i) => ({...s,sort_order:i}));
    setStops(reordered);
    if (connected) reordered.forEach(s => sbFetch(`/hunt_stops?id=eq.${s.id}`,{method:"PATCH",body:JSON.stringify({sort_order:s.sort_order})}).catch(()=>{}));
    showToast("🗺️ Remaining stops sorted!");
  };

  const startEdit = (stop) => {
    setEditingStop(stop); setNewName(stop.name); setNewAddr(stop.address);
    setNewType(stop.type); setNewOpen(stop.open_time||""); setNewClose(stop.close_time||"");
    window.scrollTo(0,0);
  };

  // ── MAP ACTIONS ────────────────────────────────────────────────────────────
  const handleMark = () => setMapSheet("pickLocation");

  const confirmPin = (status) => {
    if (!pendingPos) return;
    setMapPins(p => [...p, { id: Date.now(), ...pendingPos, status }]);
    setMapSheet(null); setPending(null);
    showToast(`${STOP_STATUS[status]?.emoji} Marked`);
  };

  const geocodeManual = async () => {
    if (!manualAddr.trim()) return;
    setGeocoding(true);
    try {
      const geo = await geocodeAddress(manualAddr);
      if (geo) { setPending(geo); setManual(""); setMapSheet("new"); }
      else showToast("⚠️ Address not found");
    } catch { showToast("⚠️ Geocoding failed"); }
    finally { setGeocoding(false); }
  };

  // Tap a planned stop pin on map → show status sheet without leaving map
  const handleStopStatusChange = useCallback((stop) => {
    setSheetTarget(stop); setMapSheet("stopStatus");
  }, []);

  const handlePinStatusChange = useCallback((pin) => {
    setSheetTarget(pin); setMapSheet("pinStatus");
  }, []);

  // ── SCHEDULE ───────────────────────────────────────────────────────────────
  const scheduled = buildSchedule(stops, startTime, defaultMins, defaultDrive);
  const endMins   = timeToMins(endTime);
  const lastStop  = scheduled[scheduled.length-1];
  const overBy    = lastStop ? Math.max(0, lastStop.leaveAt - endMins) : 0;

  const pendingList = scheduled.filter(s => s.status==="pending");
  let dayStatus = null;
  if (stops.length > 0) {
    if (!pendingList.length) dayStatus = { type:"ahead", msg:"All stops done! 🎉" };
    else {
      const diff = pendingList[0].arriveAt - nowMins;
      if (diff > 15)       dayStatus = { type:"ahead",   msg:`${Math.abs(diff)}min ahead` };
      else if (diff < -15) dayStatus = { type:"behind",  msg:`${Math.abs(diff)}min behind` };
      else                 dayStatus = { type:"ontrack", msg:"On schedule 👌" };
    }
  }

  // ── GROUP STOPS ────────────────────────────────────────────────────────────
  const namedStops   = scheduled.filter(s => !s.group_name);
  const groupedStops = scheduled.filter(s => s.group_name);
  const groups = [...new Set(groupedStops.map(s => s.group_name))];

  // ── ACTIVE vs DONE for named stops ────────────────────────────────────────
  const activeNamed = namedStops.filter(s => s.status==="pending");
  const doneNamed   = namedStops.filter(s => s.status!=="pending");

  const today = new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
  const total   = stops.length;
  const visited = stops.filter(s=>s.status==="visited").length;
  const pending = stops.filter(s=>s.status==="pending").length;
  const skipped = stops.filter(s=>s.status==="skip").length;

  // Timeline shows only named/important stops (not grouped houses)
  const tlStops = scheduled.filter(s => !s.group_name);

  const renderStopCard = (stop, idx, showReorder = true) => {
    const st      = STOP_TYPES[stop.type] || STOP_TYPES.garage;
    const ms      = STOP_STATUS[stop.status] || STOP_STATUS.pending;
    const isOpen  = expandedId === stop.id;
    const tooEarly = stop.open_time && stop.arriveAt < timeToMins(stop.open_time);
    const realIdx  = scheduled.findIndex(s => s.id === stop.id);
    return (
      <div key={stop.id} className={`sc2 ${stop.status}`} style={{ borderColor:isOpen?st.color+"55":undefined }}>
        <div className="smain" onClick={() => setExpandedId(isOpen?null:stop.id)}>
          <div className="snum">{realIdx+1}</div>
          <div className="semoji">{st.emoji}</div>
          <div className="sinfo">
            <div className="sname">{stop.name}</div>
            {stop.name !== stop.address && <div className="saddr">{stop.address}</div>}
            <div className="spills">
              <span className="pill pt">{minsToTime(stop.arriveAt)}</span>
              <span className="pill" style={{ background:ms.color+"22", color:ms.color }}>{ms.emoji} {ms.label}</span>
              {stop.open_time && <span className="pill ph">{minsToTime(timeToMins(stop.open_time))}{stop.close_time?`–${minsToTime(timeToMins(stop.close_time))}`:"+"}</span>}
              {tooEarly && <span className="pill pw">⚠️ Opens later</span>}
              {stop.notes ? <span className="pill pn">"{stop.notes}"</span> : null}
            </div>
          </div>
          {showReorder && (
            <div className="rbtns" onClick={e=>e.stopPropagation()}>
              <button className="rbtn" onClick={() => moveStop(stop.id,-1)} disabled={realIdx===0}>↑</button>
              <button className="rbtn" onClick={() => moveStop(stop.id,1)} disabled={realIdx===stops.length-1}>↓</button>
            </div>
          )}
          <span className={`schev ${isOpen?"open":""}`}>›</span>
        </div>
        {isOpen && (
          <div className="sexp">
            <div className="stbtns">
              {Object.entries(STOP_STATUS).map(([k,v]) => (
                <button key={k} className="stbtn" style={{borderColor:v.color,color:v.color,background:stop.status===k?v.color+"22":"none"}} onClick={() => updateStop(stop.id,{status:k})}>
                  <span className="stbe">{v.emoji}</span><span className="stbl">{v.label}</span>
                </button>
              ))}
            </div>
            <div className="etwo">
              <div className="ef">
                <div className="fl">MINS HERE</div>
                <div className="chips">
                  {MINS_OPTIONS.map(m => <button key={m} className={`chip ${(stop.est_minutes||defaultMins)===m?"on":""}`} onClick={()=>updateStop(stop.id,{est_minutes:m})}>{minsLabel(m)}</button>)}
                </div>
              </div>
            </div>
            <div className="ef">
              <div className="fl">DRIVE TO NEXT (override)</div>
              <div className="chips">
                <button className={`chip ${stop.drive_override==null?"on":""}`} onClick={()=>updateStop(stop.id,{drive_override:null})}>Auto</button>
                {DRIVE_OPTIONS.map(m => <button key={m} className={`chip ${stop.drive_override===m?"on":""}`} onClick={()=>updateStop(stop.id,{drive_override:m})}>{minsLabel(m)}</button>)}
              </div>
            </div>
            <textarea className="sni" rows={2} placeholder="Notes… (cash only, lots of tools)" value={stop.notes||""} onChange={e=>updateStop(stop.id,{notes:e.target.value})}/>
            <div className="sacts">
              <button className="sa nav" onClick={()=>window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`,"_blank")}>🧭 Nav</button>
              <button className="sa edit" onClick={()=>{startEdit(stop);setExpandedId(null);}}>✏️ Edit</button>
              <button className="sa" onClick={()=>{navigator.clipboard?.writeText(stop.address);showToast("Copied!");}}>📋</button>
              <button className="sa danger" onClick={()=>deleteStop(stop.id)}>🗑</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="shell">

        <div className="hdr">
          <div className="logo"><span>Flip</span>Scout</div>
          <div className="hdr-r">
            <div className={`sdot ${connected?"live":""}`}/>
            <div className="dbadge">{today}</div>
          </div>
        </div>

        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",minHeight:0}}>

          {/* ══ PLAN TAB ══ */}
          {activeTab==="plan" && (
            <div className="page">
              <div className="planwrap">

                <div className="stats">
                  <div className="sc"><div className="sn">{total}</div><div className="sl">STOPS</div></div>
                  <div className="sc"><div className="sn a">{pending}</div><div className="sl">LEFT</div></div>
                  <div className="sc"><div className="sn g">{visited}</div><div className="sl">DONE</div></div>
                  <div className="sc"><div className="sn gr">{skipped}</div><div className="sl">SKIP</div></div>
                </div>

                {/* Schedule */}
                <div className="card">
                  <div className="clabel">DAY SCHEDULE</div>
                  <div className="srow">
                    <div className="sf"><div className="fl">START</div><input className="fi" type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}/></div>
                    <div className="sf"><div className="fl">END</div><input className="fi" type="time" value={endTime} onChange={e=>setEndTime(e.target.value)}/></div>
                    <div className="sf"><div className="fl">DATE</div><input className="fi" type="date" value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/></div>
                  </div>
                  <div className="fl" style={{marginBottom:5}}>MINS PER STOP</div>
                  <div className="chips" style={{marginBottom:8}}>
                    {MINS_OPTIONS.map(m=><button key={m} className={`chip ${defaultMins===m?"on":""}`} onClick={()=>setDefaultMins(m)}>{minsLabel(m)}</button>)}
                  </div>
                  <div className="fl" style={{marginBottom:5}}>DEFAULT DRIVE TIME</div>
                  <div className="chips">
                    {DRIVE_OPTIONS.map(m=><button key={m} className={`chip ${defaultDrive===m?"on":""}`} onClick={()=>setDefaultDrive(m)}>{minsLabel(m)}</button>)}
                  </div>

                  {/* Timeline — named stops only */}
                  {tlStops.length > 0 && (
                    <div className="tl">
                      {tlStops.map((stop,i) => {
                        const st = STOP_TYPES[stop.type]||STOP_TYPES.garage;
                        const isNow = stop.arriveAt<=nowMins&&nowMins<stop.leaveAt;
                        const dotCol = stop.status==="visited"?"#22c55e":stop.status==="skip"?"#6b7280":st.color;
                        const tooEarly = stop.open_time && stop.arriveAt < timeToMins(stop.open_time);
                        return (
                          <React.Fragment key={stop.id}>
                            <div className="tlr">
                              <div className={`tlt ${isNow?"now":""}`}>{minsToTime(stop.arriveAt)}</div>
                              <div className="tlsp">
                                <div className="tldot" style={{background:dotCol}}/>
                                {i < tlStops.length-1 && <div className="tlline"/>}
                              </div>
                              <div className="tlc">
                                <div className={`tln ${isNow?"now":""}`}>{st.emoji} {stop.name}</div>
                                <div className="tlm">
                                  {minsLabel(stop.est_minutes||defaultMins)}
                                  {stop.open_time && <span> · {minsToTime(timeToMins(stop.open_time))}{stop.close_time?`–${minsToTime(timeToMins(stop.close_time))}`:"+"}</span>}
                                  {tooEarly && <span className="tlwarn"> ⚠️ Opens later</span>}
                                </div>
                              </div>
                            </div>
                            {i < tlStops.length-1 && (
                              <div className="tldrive">🚗 {minsLabel(stop.driveToNext)}{stop.drive_override!=null?" (override)":" (est.)"}</div>
                            )}
                          </React.Fragment>
                        );
                      })}
                      <div className="tlend">
                        <div className="tlendtime">{minsToTime(endMins)}</div>
                        <div style={{width:16,display:"flex",justifyContent:"center"}}><div className="tlenddot"/></div>
                        <div className="tlendlabel" style={{paddingLeft:6}}>Done for the day</div>
                      </div>
                    </div>
                  )}

                  {overBy > 0 && <div className="overwarn">⚠️ Schedule runs {minsLabel(overBy)} over end time</div>}
                  {!overBy && dayStatus && stops.length > 0 && (
                    <div className={`daystatus ${dayStatus.type}`}>
                      {dayStatus.type==="ahead"?"✅":dayStatus.type==="behind"?"⚠️":"👌"} {dayStatus.msg}
                    </div>
                  )}
                </div>

                {/* Add / Edit */}
                <div className="addcard">
                  <div className="clabel">{editingStop?"EDIT STOP":"ADD A STOP"}</div>
                  <div className="typerow">
                    {Object.entries(STOP_TYPES).map(([k,v])=>(
                      <button key={k} className={`tc ${newType===k?"on":""}`}
                        style={{background:newType===k?v.color:"none",color:newType===k?"#0c0c10":"var(--muted)",borderColor:newType===k?v.color:"var(--border)"}}
                        onClick={()=>setNewType(k)}>{v.emoji} {v.label}</button>
                    ))}
                  </div>
                  <input className="ai" placeholder="Name (optional for individual houses)" value={newName} onChange={e=>setNewName(e.target.value)}/>
                  <input className="ai" placeholder="Address (e.g. 123 Oak St, Hoover AL)" value={newAddr} onChange={e=>setNewAddr(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&saveStop(newAddr,newName,newType,newOpen,newClose,editingStop?.id)}/>
                  <div className="twocol">
                    <div className="sf"><div className="fl">OPENS (optional)</div><input className="fi" type="time" value={newOpen} onChange={e=>setNewOpen(e.target.value)}/></div>
                    <div className="sf"><div className="fl">CLOSES (optional)</div><input className="fi" type="time" value={newClose} onChange={e=>setNewClose(e.target.value)}/></div>
                  </div>
                  <div className="addrow">
                    {editingStop && <button className="abtn ghost" onClick={()=>{setEditingStop(null);setNewAddr("");setNewName("");setNewOpen("");setNewClose("");}}>Cancel</button>}
                    <button className="abtn" onClick={()=>saveStop(newAddr,newName,newType,newOpen,newClose,editingStop?.id)} disabled={adding||!newAddr.trim()}>
                      {adding?"…":editingStop?"SAVE CHANGES":"+ ADD STOP"}
                    </button>
                    {!editingStop && <button className="pbtn" onClick={()=>setPasteModal(true)}>📋 PASTE LIST</button>}
                  </div>
                </div>

                {/* Stops */}
                {stops.length > 0 && (
                  <>
                    <div className="listhdr">
                      <span className="listlabel">YOUR STOPS</span>
                      <div className="listactions">
                        <button className="routebtn" onClick={sortRemaining}>🗺️ Sort Remaining</button>
                        <button className="clearallbtn" onClick={()=>{ if(!window.confirm(`Clear all ${stops.length} stops?`)) return; if(connected) sbFetch(`/hunt_stops?session_date=eq.${sessionDate}`,{method:"DELETE"}).catch(()=>{}); setStops([]); }}>CLEAR ALL</button>
                      </div>
                    </div>

                    {/* Active named stops */}
                    {activeNamed.map(stop => renderStopCard(stop, 0, true))}

                    {/* Groups */}
                    {groups.map(group => {
                      const gStops = groupedStops.filter(s => s.group_name === group);
                      const gPending = gStops.filter(s => s.status==="pending").length;
                      const gDone = gStops.filter(s => s.status!=="pending").length;
                      const isExpanded = expandedGroups[group];
                      return (
                        <div key={group} style={{display:"flex",flexDirection:"column",gap:6}}>
                          <div className="grouphdr" onClick={()=>setExpandedGroups(p=>({...p,[group]:!p[group]}))}>
                            <span className="groupname">🏘 {group}</span>
                            <span className="groupmeta">{gPending} left · {gDone} done</span>
                            <span className={`groupchev ${isExpanded?"open":""}`}>›</span>
                          </div>
                          {isExpanded && (
                            <div className="groupchildren">
                              {gStops.map(stop => renderStopCard(stop, 0, false))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Done named stops */}
                    {doneNamed.length > 0 && (
                      <>
                        <button className="donetoggle" onClick={()=>setShowDone(p=>!p)}>
                          <span>✅ {doneNamed.length} {doneNamed.length===1?"stop":"stops"} done</span>
                          <span>{showDone?"▲":"▼"}</span>
                        </button>
                        {showDone && doneNamed.map(stop => renderStopCard(stop, 0, true))}
                      </>
                    )}
                  </>
                )}

                {stops.length === 0 && (
                  <div className="empty">
                    <span className="eicon">🗓</span>
                    <div className="etxt">No stops yet.<br/>Add addresses from estatesales.net,<br/>Facebook, or Craigslist above.</div>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* ══ MAP TAB ══ */}
          {activeTab==="map" && (
            <div className="page mappage">
              <LeafletMap
                userPos={userPos}
                gpsReady={gpsReady}
                stops={scheduled}
                mapPins={mapPins}
                nowMins={nowMins}
                onMarkClick={handleMark}
                onStopStatusChange={handleStopStatusChange}
                onPinStatusChange={handlePinStatusChange}
                onPinDelete={(id) => { if(id==="all") setMapPins([]); else setMapPins(p=>p.filter(x=>x.id!==id)); }}
              />

              {/* Pick location sheet */}
              {mapSheet==="pickLocation" && (
                <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setMapSheet(null)}>
                  <div className="sheet">
                    <div className="shandle"/>
                    <div className="stitle">WHERE IS THIS HOUSE?</div>
                    <div className="sstrow">
                      <button className="sstbtn" style={{borderColor:"#f59e0b",color:"#f59e0b"}}
                        onClick={()=>{ if(gpsReady&&userPos){setPending(userPos);setMapSheet("new");}else setMapSheet("noGps"); }}>
                        <span className="sse">📍</span>
                        <span className="ssl">HERE NOW</span>
                        <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(245,158,11,0.5)",marginTop:2}}>current GPS</span>
                      </button>
                      <button className="sstbtn" style={{borderColor:"#60a5fa",color:"#60a5fa"}}
                        onClick={()=>setMapSheet("noGps")}>
                        <span className="sse">🗺️</span>
                        <span className="ssl">PAST SPOT</span>
                        <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(96,165,250,0.5)",marginTop:2}}>enter address</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* New pin status */}
              {mapSheet==="new" && (
                <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setMapSheet(null)}>
                  <div className="sheet">
                    <div className="shandle"/>
                    <div className="stitle">MARK THIS HOUSE</div>
                    <div className="sstrow">
                      {Object.entries(STOP_STATUS).map(([k,v])=>(
                        <button key={k} className="sstbtn" style={{borderColor:v.color,color:v.color}} onClick={()=>confirmPin(k)}>
                          <span className="sse">{v.emoji}</span><span className="ssl">{v.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* No GPS */}
              {mapSheet==="noGps" && (
                <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setMapSheet(null)}>
                  <div className="sheet">
                    <div className="shandle"/>
                    <div className="nogpstitle">Enter Address</div>
                    <div className="nogpssub">Type the address of the house you want to pin.</div>
                    <input className="addrinput" placeholder="87 Marlstone Dr, Helena AL" value={manualAddr} onChange={e=>setManual(e.target.value)} onKeyDown={e=>e.key==="Enter"&&geocodeManual()} autoFocus/>
                    <button className="primebtn" onClick={geocodeManual} disabled={geocoding||!manualAddr.trim()}>{geocoding?"Finding…":"Drop Pin Here"}</button>
                    <button className="cancelbtn" onClick={()=>setMapSheet(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Stop status — shown on MAP without leaving tab */}
              {mapSheet==="stopStatus" && sheetTarget && (
                <MapStatusSheet
                  target={sheetTarget} type="stop"
                  onUpdate={(status) => { updateStop(sheetTarget.id,{status}); setMapSheet(null); setSheetTarget(null); showToast(`${STOP_STATUS[status]?.emoji} ${sheetTarget.name}`); }}
                  onDelete={null}
                  onClose={()=>{ setMapSheet(null); setSheetTarget(null); }}
                />
              )}

              {/* Pin status */}
              {mapSheet==="pinStatus" && sheetTarget && (
                <MapStatusSheet
                  target={sheetTarget} type="pin"
                  onUpdate={(status) => { setMapPins(p=>p.map(x=>x.id===sheetTarget.id?{...x,status}:x)); setMapSheet(null); setSheetTarget(null); showToast(`${STOP_STATUS[status]?.emoji} Updated`); }}
                  onDelete={() => { setMapPins(p=>p.filter(x=>x.id!==sheetTarget.id)); setMapSheet(null); setSheetTarget(null); showToast("Pin removed"); }}
                  onClose={()=>{ setMapSheet(null); setSheetTarget(null); }}
                />
              )}
            </div>
          )}
        </div>

        <nav className="bnav">
          <button className={`nbtn ${activeTab==="plan"?"on":""}`} onClick={()=>setActiveTab("plan")}>
            <span className="nicon">📋</span><span className="nlabel">PLAN</span>
          </button>
          <button className={`nbtn ${activeTab==="map"?"mapon":""}`} onClick={()=>setActiveTab("map")}>
            <span className="nicon">🗺️</span><span className="nlabel">MAP</span>
          </button>
        </nav>

        {/* PASTE MODAL */}
        {pasteModal && (
          <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setPasteModal(false)}>
            <div className="sheet">
              <div className="shandle"/>
              <div style={{fontSize:16,fontWeight:700,color:"var(--text)",marginBottom:6}}>Paste Address List</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--muted)",lineHeight:1.6,marginBottom:12}}>One address per line. Give the group a name to collapse them together.</div>
              <input className="groupnameinput" placeholder="Group name (e.g. Russet Woods Community Sale)" value={pasteGroup} onChange={e=>setPasteGroup(e.target.value)}/>
              <div className="fl" style={{marginBottom:5}}>MINS PER STOP</div>
              <div className="chips" style={{marginBottom:10}}>
                {MINS_OPTIONS.map(m=><button key={m} className={`chip ${pasteMins===m?"on":""}`} onClick={()=>setPasteMins(m)}>{minsLabel(m)}</button>)}
              </div>
              <textarea className="pastearea" rows={6} placeholder={"305 Russet Woods Cir, Hoover AL 35244\n1844 Russet Hill Cir, Hoover AL 35244"} value={pasteText} onChange={e=>setPasteText(e.target.value)} autoFocus/>
              <div className="modalacts">
                <button className="ghostbtn" onClick={()=>setPasteModal(false)}>Cancel</button>
                <button className="primebtn" style={{flex:1}} onClick={handlePaste} disabled={pasting||!pasteText.trim()}>
                  {pasting?`Adding… (${pasteText.split("\n").filter(l=>l.trim().length>5).length} stops)`:`Add ${pasteText.split("\n").filter(l=>l.trim().length>5).length} Stops`}
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
