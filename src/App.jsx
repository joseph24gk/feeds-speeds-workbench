import React, { useState, useEffect, useMemo, useRef } from "react";

/* ============================================================
   SHOP DATA — generic physics fallback tables
   All internal math is INCH. Metric is a display layer.
   ============================================================ */

/* SFM ranges + chipload (ipt at 1/2" Ø) are reconciled against common carbide
   references (6gtools AlTiN chart, Machining Doctor chip-load charts, general
   chipload charts) so generic seeds land near what FSWizard and friends suggest.
   uhp = specific MRR (in³/min per HP); hp = mrr/uhp. stock = radial stock-to-leave. */
const GROUPS = {
  N1: { label: "N1 · Wrought aluminum", ex: "6061, 7075, 2024, MIC-6", sfm: [600, 1200], ipt: 0.004, uhp: 3.5, stock: [0.010, 0.015] },
  N2: { label: "N2 · Cast aluminum (low Si)", ex: "A356, 319", sfm: [500, 900], ipt: 0.0035, uhp: 3.0, stock: [0.010, 0.015] },
  N3: { label: "N3 · Cast aluminum (high Si >12%)", ex: "390, A413", sfm: [350, 600], ipt: 0.003, uhp: 2.5, stock: [0.010, 0.015] },
  N4: { label: "N4 · Brass / copper", ex: "360 brass, C110", sfm: [400, 800], ipt: 0.0035, uhp: 2.2, stock: [0.008, 0.012] },
  P1: { label: "P1 · Low-carbon / free-machining steel", ex: "1018, 12L14, A36", sfm: [350, 500], ipt: 0.003, uhp: 1.1, stock: [0.005, 0.010] },
  P2: { label: "P2 · Medium-carbon / alloy steel", ex: "1045, 4140 ann., 4340 ann.", sfm: [275, 400], ipt: 0.0028, uhp: 1.0, stock: [0.005, 0.010] },
  P3: { label: "P3 · Alloy steel, pre-hard (28–38 HRC)", ex: "4140HT, P20, 4340HT", sfm: [200, 300], ipt: 0.0025, uhp: 0.85, stock: [0.005, 0.008] },
  M1: { label: "M1 · Free-machining stainless", ex: "303", sfm: [250, 375], ipt: 0.003, uhp: 0.95, stock: [0.005, 0.010] },
  M2: { label: "M2 · Austenitic stainless", ex: "304, 316", sfm: [180, 280], ipt: 0.0022, uhp: 0.85, stock: [0.005, 0.010] },
  M3: { label: "M3 · PH / duplex stainless", ex: "17-4, 15-5, 2205", sfm: [150, 240], ipt: 0.002, uhp: 0.8, stock: [0.004, 0.008] },
  K1: { label: "K1 · Cast iron", ex: "Gray, ductile", sfm: [300, 500], ipt: 0.0035, uhp: 1.4, stock: [0.006, 0.010] },
  S1: { label: "S1 · Titanium alloys", ex: "Ti-6Al-4V", sfm: [120, 220], ipt: 0.0022, uhp: 0.7, stock: [0.004, 0.008] },
  S2: { label: "S2 · Nickel superalloys", ex: "Inconel 718, 625", sfm: [60, 120], ipt: 0.002, uhp: 0.5, stock: [0.004, 0.006] },
  H1: { label: "H1 · Hardened steel (45–60 HRC)", ex: "D2, H13, A2 hardened", sfm: [100, 180], ipt: 0.0018, uhp: 0.65, stock: [0.003, 0.005] },
};

// Drill fallback: fraction of endmill SFM, and IPR at 1/2" dia
const DRILL = {
  sfmFactor: 0.7,
  iprAtHalf: { N1: 0.008, N2: 0.007, N3: 0.006, N4: 0.007, P1: 0.007, P2: 0.006, P3: 0.005, M1: 0.005, M2: 0.004, M3: 0.0035, K1: 0.008, S1: 0.003, S2: 0.002, H1: 0.002 },
};

const TOOL_TYPES = { square_endmill: "Square end mill", ball_endmill: "Ball end mill", chamfer_mill: "Chamfer mill", drill: "Drill", tap: "Tap" };

/* drill-size decimal equivalents (inch) — number (#1–80) and letter (A–Z) gauges */
const NUMBER_DRILLS = [null, 0.2280, 0.2210, 0.2130, 0.2090, 0.2055, 0.2040, 0.2010, 0.1990, 0.1960, 0.1935, 0.1910, 0.1890, 0.1850, 0.1820, 0.1800, 0.1770, 0.1730, 0.1695, 0.1660, 0.1610, 0.1590, 0.1570, 0.1540, 0.1520, 0.1495, 0.1470, 0.1440, 0.1405, 0.1360, 0.1285, 0.1200, 0.1160, 0.1130, 0.1110, 0.1100, 0.1065, 0.1040, 0.1015, 0.0995, 0.0980, 0.0960, 0.0935, 0.0890, 0.0860, 0.0820, 0.0810, 0.0785, 0.0760, 0.0730, 0.0700, 0.0670, 0.0635, 0.0595, 0.0550, 0.0520, 0.0465, 0.0430, 0.0420, 0.0410, 0.0400, 0.0390, 0.0380, 0.0370, 0.0360, 0.0350, 0.0330, 0.0320, 0.0310, 0.0292, 0.0280, 0.0260, 0.0250, 0.0240, 0.0225, 0.0210, 0.0200, 0.0180, 0.0160, 0.0145, 0.0135];
const LETTER_DRILLS = { A: 0.234, B: 0.238, C: 0.242, D: 0.246, E: 0.250, F: 0.257, G: 0.261, H: 0.266, I: 0.272, J: 0.277, K: 0.281, L: 0.290, M: 0.295, N: 0.302, O: 0.316, P: 0.323, Q: 0.332, R: 0.339, S: 0.348, T: 0.358, U: 0.368, V: 0.377, W: 0.386, X: 0.397, Y: 0.404, Z: 0.413 };

/* parse a drill/tool size string → { dia (inch), label, metric } or null.
   accepts: decimal ".201" / "0.25", fraction "1/4" "5/16", metric "8.5mm" "6 mm",
   number gauge "#7" / "no 7" / "7", letter gauge "F" / "q". */
function parseDrillSize(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  let m;
  if ((m = s.match(/^([\d.]+)\s*mm$/)) || (m = s.match(/^([\d.]+)\s*m$/))) {
    const mm = parseFloat(m[1]);
    return Number.isFinite(mm) && mm > 0 ? { dia: mm / IN_MM, label: fmt(mm, 2) + " mm", metric: true } : null;
  }
  if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) {
    const num = parseInt(m[1]), den = parseInt(m[2]);
    return den > 0 ? { dia: num / den, label: num + "/" + den + '"' } : null;
  }
  if (/^[a-z]$/.test(s) && LETTER_DRILLS[s.toUpperCase()]) {
    return { dia: LETTER_DRILLS[s.toUpperCase()], label: s.toUpperCase() + " drill" };
  }
  if ((m = s.match(/^(?:#|no\.?\s*)?(\d{1,2})$/)) && !s.includes(".")) {
    const n = parseInt(m[1]);
    if (n >= 1 && n <= 80 && NUMBER_DRILLS[n]) return { dia: NUMBER_DRILLS[n], label: "#" + n + " drill" };
  }
  if ((m = s.match(/^\.?\d*\.?\d+$/))) {
    const d = parseFloat(s);
    return Number.isFinite(d) && d > 0 ? { dia: d, label: fmt(d, 4) + '"' } : null;
  }
  return null;
}

// ISO 513 material-class colors (letter is standardized; sub-numbers are brand styling)
const ISO_COLORS = { P: "#1B5FAA", M: "#D9A400", K: "#C0392B", N: "#1E8F4E", S: "#C96A1E", H: "#6E7B8A" };
const groupColor = (g) => ISO_COLORS[g?.[0]] || "#6B7280";

/* ---------------- icons ----------------
   Tool-type glyphs are original side-profile silhouettes (shank on top,
   business end down) — no icon set ships real end mills, so these are drawn
   to read like the actual tools at a glance. */
const TYPE_ICONS = {
  square_endmill: ["M9 2h6v20H9z", "M9 12.5l6 2.3", "M9 16.2l6 2.3"],
  ball_endmill: ["M9 2h6v17a3 3 0 0 1-6 0z", "M9 12l6 2.3", "M9 15.7l6 2.3"],
  chamfer_mill: ["M9 2h6v11l-2 7h-2l-2-7z", "M9 13h6"],
  drill: ["M9 2h6v14l-3 6-3-6z", "M9 6.5l6 2.6", "M9 11l6 2.6"],
  tap: ["M10.5 2h3v7h1v9l-1.8 3.5h-1.4L9.5 18V9h1z", "M9 11.2h6", "M9 13.6h6", "M9 16h6"],
};
function TypeIcon({ type, size = 20 }) {
  const paths = TYPE_ICONS[type];
  if (!paths) return null;
  return (
    <svg className="ticon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/* brand marks: favicons fetched at render time; unknown brands / failed loads show nothing.
   Every domain here was verified to return a real icon (not the default globe). */
const BRAND_DOMAINS = {
  // cutting tool brands
  kennametal: "kennametal.com", widia: "widia.com", harvey: "harveytool.com",
  helical: "helicaltool.com", osg: "osgtool.com", guhring: "guhring.com", "gühring": "guhring.com",
  sandvik: "sandvik.coromant.com", coromant: "sandvik.coromant.com", iscar: "iscar.com",
  seco: "secotools.com", walter: "walter-tools.com", mitsubishi: "mmc-carbide.com",
  kyocera: "kyocera-sgstool.com", sgs: "kyocera-sgstool.com", "yg-1": "yg1.kr", yg1: "yg1.kr",
  niagara: "niagaracutter.com", emuge: "emuge.com", garr: "garrtool.com", "ma ford": "maford.com",
  "m.a. ford": "maford.com", "micro 100": "micro100.com", micro100: "micro100.com",
  lakeshore: "lakeshorecarbide.com", maritool: "maritool.com", destiny: "destinytool.com",
  imco: "imcousa.com", amana: "amanatool.com", melin: "melintool.com", morse: "morsecuttingtools.com",
  onsrud: "onsrud.com", vortex: "vortextool.com",
  // CAM software (the adaptive/dynamic toolpath is Fusion/Autodesk HSM's term)
  fusion: "autodesk.com", autodesk: "autodesk.com",
  // machine tool brands
  haas: "haascnc.com", tormach: "tormach.com", mazak: "mazakusa.com", okuma: "okuma.com",
  dmg: "dmgmori.com", "mori seiki": "dmgmori.com", deckel: "dmgmori.com", maho: "dmgmori.com",
  doosan: "doosanmachinetools.com", "dn solutions": "dn-solutions.com", "hyundai wia": "hyundai-wia.com",
  fanuc: "fanucamerica.com", robodrill: "fanucamerica.com", hurco: "hurco.com", fadal: "fadalcnc.com",
  syil: "syil.com", brother: "brothercnc.com", speedio: "brothercnc.com", makino: "makino.com",
  matsuura: "matsuurausa.com", kitamura: "kitamura-machinery.com", milltronics: "milltronics.net",
  hardinge: "hardinge.com", bridgeport: "hardinge.com", grizzly: "grizzly.com",
  "precision matthews": "precisionmatthews.com", "south bend": "southbendlathe.com",
  southbend: "southbendlathe.com", kent: "kentusa.com", nakamura: "nakamura-tome.com",
  prototrak: "southwesternindustries.com", "southwestern industries": "southwesternindustries.com",
  emco: "emco-world.com", datron: "datron.com", tsugami: "tsugamiamerica.com",
  victor: "victortaichung.com", langmuir: "langmuirsystems.com", avid: "avidcnc.com",
  shopsabre: "shopsabre.com",
};
function brandDomain(name) {
  const n = (name || "").toLowerCase();
  let best = null;
  for (const [k, d] of Object.entries(BRAND_DOMAINS)) {
    if (n.includes(k) && (!best || k.length > best[0].length)) best = [k, d];
  }
  return best ? best[1] : null;
}
function BrandIcon({ name, size = 16 }) {
  const domain = brandDomain(name);
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [domain]);
  if (!domain || broken) return null;
  return <img className="bicon" width={size} height={size} loading="lazy" alt="" src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} onError={() => setBroken(true)} />;
}

const FINISH_FZ_FACTOR = 0.6; // finishing chipload vs roughing
const FINISH_SFM_FACTOR = 1.1; // slightly higher speed for finish is fine

// chipload scales with diameter (baseline table is for 1/2")
const scaleIpt = (iptAtHalf, dia) => iptAtHalf * Math.pow(Math.max(dia, 0.01) / 0.5, 0.7);

/* ---------------- unit helpers ---------------- */
const IN_MM = 25.4;
const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 }) : "—");

/* display diameter as shop fraction (1/4", 3/8") when it lands on a 64th, else decimal */
function diaLabel(d, metric) {
  if (!Number.isFinite(d)) return "—";
  if (metric) return fmt(d * IN_MM, 2) + " mm";
  const n = Math.round(d * 64);
  if (n > 0 && Math.abs(d * 64 - n) < 0.02) {
    let num = n, den = 64;
    while (num % 2 === 0 && den > 1) { num /= 2; den /= 2; }
    return den === 1 ? num + '"' : num + "/" + den + '"';
  }
  return fmt(d, 4) + '"';
}
/* metric-callout tools (metric drills/taps) show mm in labels regardless of global units;
   feeds & speeds still run/display in the global unit system — the shop-floor hybrid */
const toolDiaLabel = (t, metric) => (t.metricTool ? fmt(t.dia * IN_MM, t.dia * IN_MM < 10 ? 2 : 1) + " mm" : diaLabel(t.dia, metric));
function tapThreadLabel(t) {
  if (t.type !== "tap" || !Number.isFinite(t.pitch) || t.pitch <= 0) return null;
  if (t.metricTool) return "M" + fmt(t.dia * IN_MM, 1).replace(/\.0$/, "") + "×" + fmt(t.pitch * IN_MM, 2);
  return diaLabel(t.dia, false) + "-" + fmt(1 / t.pitch, 0);
}
const toolLabel = (t, metric) => {
  const th = tapThreadLabel(t);
  if (th) return th + " " + (t.series || "tap");
  const bp = [t.brand, t.pn].filter(Boolean).join(" ").trim();
  const typeName = ({ square_endmill: "end mill", ball_endmill: "ball", chamfer_mill: "chamfer", drill: "drill", tap: "tap" })[t.type] || "tool";
  return toolDiaLabel(t, metric) + " " + (t.series || t.name || bp || typeName);
};
const hasMfgData = (t) => Object.keys(t.cutting || {}).length > 0;
const canCut = (t, grp) => !hasMfgData(t) || !!t.cutting[grp];

/* ---------------- spindle power curves ----------------
   A machine carries an array of curves. duty "continuous" curves are the
   selectable configurations (belts, gear ranges, separate spindles); duty
   "burst" curves are intermittent ratings (S6 / 30-min / peak) layered on top.
   A burst curve applies to the continuous curve named by forId, or to any
   configuration when forId is empty. */
function interpHp(points, rpm) {
  const pts = [...points].sort((a, b) => a.rpm - b.rpm);
  if (rpm <= pts[0].rpm) return pts[0].hp;
  if (rpm >= pts[pts.length - 1].rpm) return pts[pts.length - 1].hp;
  for (let i = 1; i < pts.length; i++) {
    if (rpm <= pts[i].rpm) {
      const a = pts[i - 1], b = pts[i];
      return a.hp + ((rpm - a.rpm) / (b.rpm - a.rpm || 1)) * (b.hp - a.hp);
    }
  }
  return pts[pts.length - 1].hp;
}
const contCurves = (m) => (m?.curves || []).filter((c) => c.duty !== "burst");
const burstCurvesOf = (m) => (m?.curves || []).filter((c) => c.duty === "burst");
function pickCont(m, curveId) {
  const cs = contCurves(m);
  return cs.find((c) => c.id === curveId) || cs[0] || null;
}
function pickBurst(m, contId) {
  const bs = burstCurvesOf(m);
  return bs.find((c) => c.forId && c.forId === contId) || bs.find((c) => !c.forId) || null;
}
function availableHp(machine, rpm, curveId) {
  if (!machine) return null;
  const c = pickCont(machine, curveId);
  if (!c || (c.points?.length || 0) < 2) return Number.isFinite(machine.hp) ? machine.hp : null;
  return interpHp(c.points, rpm);
}
function availableBurstHp(machine, rpm, curveId) {
  const b = pickBurst(machine, pickCont(machine, curveId)?.id);
  return b && b.points?.length > 1 ? interpHp(b.points, rpm) : null;
}
/* a config (low belt, live tooling…) can top out below the machine's overall max RPM */
function machineMaxRpm(machine, curveId) {
  if (!machine) return null;
  const c = pickCont(machine, curveId);
  if (c && Number.isFinite(c.maxRpm) && c.maxRpm > 0) return Math.min(c.maxRpm, machine.maxRpm || c.maxRpm);
  return machine.maxRpm;
}
let curveSeq = 0;
const curveUid = () => "c" + Date.now().toString(36) + (curveSeq++).toString(36);
/* pre-curves-array machines carried a single machine.curve */
function migrateMachine(m) {
  if (!m || Array.isArray(m.curves)) return m;
  const { curve, curveSrc, ...rest } = m;
  const curves = curve?.length > 1 ? [{ id: curveUid(), label: "Spindle", duty: "continuous", maxRpm: null, points: curve, srcName: curveSrc || "" }] : [];
  return { ...rest, curves };
}
function parseCurvePairs(text) {
  const pts = [];
  for (const line of text.split(/\r?\n/)) {
    const nums = line.split(/[,;\t]+/).map((s) => parseFloat(s.replace(/[^0-9.eE+-]/g, ""))).filter(Number.isFinite);
    if (nums.length >= 2 && nums[0] >= 0) pts.push({ x: nums[0], y: nums[1] });
  }
  return pts;
}
const CURVE_UNITS = {
  hp: { label: "HP", conv: (y) => y },
  kw: { label: "kW", conv: (y) => y * 1.341 },
  ftlb: { label: "Torque (ft-lb)", conv: (y, rpm) => (y * rpm) / 5252 },
  nm: { label: "Torque (Nm)", conv: (y, rpm) => (y * rpm) / 7121 },
};

/* ---------------- storage ---------------- */
const KEY = "fsw:data:v1";
const API_BASE = (import.meta.env.VITE_API_BASE || localStorage.getItem("fsw:apiBase") || "").replace(/\/+$/, "");
async function loadAll() {
  try {
    const r = localStorage.getItem(KEY);
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}
async function saveAll(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.error("save failed", e); }
}
async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `API request failed (${response.status})`);
  return data;
}

/* streaming POST: the Worker sends SSE progress milestones while the AI works,
   then a final result — so 1–5 min lookups show what's happening instead of a dead spinner */
async function apiStream(path, body, onProgress) {
  const response = await fetch(`${API_BASE}${path}?stream=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/event-stream")) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `API request failed (${response.status})`);
    return data; // older Worker without streaming — plain JSON still works
  }
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = "", result = null, errMsg = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        let ev;
        try { ev = JSON.parse(line.slice(5)); } catch { continue; }
        if (ev.type === "progress" && ev.msg && onProgress) onProgress(ev.msg);
        else if (ev.type === "result") result = ev.data;
        else if (ev.type === "error") errMsg = ev.error;
      }
    }
  }
  if (errMsg) throw new Error(errMsg);
  if (!result) throw new Error("connection dropped before the result arrived — try again");
  return result;
}

/* ---------------- AI lookup ---------------- */
async function lookupTool(brand, pn, onProgress) {
  return apiStream("/api/tool-lookup", { brand, pn }, onProgress);
}

/* ---------------- AI torque-curve digitization (PDF or image) ---------------- */
async function digitizeCurve(file) {
  const b64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("read failed"));
    r.readAsDataURL(file);
  });
  return apiPost("/api/curve-digitize", { filename: file.name, mimeType: file.type || "application/octet-stream", fileData: b64 });
}

/* ---------------- AI machine-curve web search ---------------- */
async function findMachineCurves(machine, onProgress) {
  return apiStream("/api/machine-curves", { machine: machine.name, maxRpm: machine.maxRpm, notes: machine.notes || "" }, onProgress);
}

/* mm:ss for the long-lookup elapsed timers */
function useElapsed(running) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) { setSecs(0); return; }
    const t0 = Date.now();
    const iv = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [running]);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

/* ---------------- Fusion .tools import (a .tools file is a zip with JSON inside) ---------------- */
async function unzipEntries(buf) {
  const dv = new DataView(buf);
  let i = buf.byteLength - 22;
  while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
  if (i < 0) throw new Error("not a zip archive");
  const count = dv.getUint16(i + 10, true);
  let off = dv.getUint32(i + 16, true);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const cmtLen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, off + 46, nameLen));
    entries.push({ name, method, csize, lho });
    off += 46 + nameLen + extraLen + cmtLen;
  }
  const out = [];
  for (const e of entries) {
    const nl = dv.getUint16(e.lho + 26, true);
    const el = dv.getUint16(e.lho + 28, true);
    const comp = new Uint8Array(buf, e.lho + 30 + nl + el, e.csize);
    let bytes;
    if (e.method === 0) bytes = comp;
    else if (e.method === 8) {
      const stream = new Blob([comp]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else continue;
    out.push({ name: e.name, text: new TextDecoder().decode(bytes) });
  }
  return out;
}

const FUSION_TYPES = {
  "flat end mill": "square_endmill", "ball end mill": "ball_endmill", "chamfer mill": "chamfer_mill",
  "drill": "drill", "jobber drill": "drill", "stub drill": "drill", "taper drill": "drill",
  "tap": "tap", "tap right hand": "tap", "tap left hand": "tap", "thread tap": "tap",
};
function mapFusionTool(ft) {
  const type = FUSION_TYPES[(ft.type || "").toLowerCase()];
  if (!type) return null;
  const g = ft.geometry || {};
  const inches = (ft.unit || "millimeters").startsWith("inch");
  const cv = (v) => (Number.isFinite(v) ? (inches ? v : v / IN_MM) : null);
  const dia = cv(g.DC);
  if (!dia) return null;
  const extra = type === "chamfer_mill"
    ? { angle: Number.isFinite(g.TA) ? 2 * g.TA : 90, tipDia: cv(g["tip-diameter"]) ?? 0 }
    : type === "tap" ? { pitch: cv(g.TP) ?? null } : {};
  return {
    id: "f" + Date.now() + Math.random().toString(36).slice(2, 6),
    brand: ft.vendor || "", pn: ft["product-id"] || "", series: "", name: ft.description || "",
    type, dia, flutes: g.NOF || 2, coating: "", loc: cv(g.LCF), metricTool: !inches,
    cutting: {}, source: "fusion-import", notes: "", ...extra,
  };
}

/* ============================================================
   MATH CORE
   ============================================================ */
function computeCut({ tool, machine, curveId, group, op, mode, sfm, ae, ap, targetChip, fz, ipr }) {
  const g = GROUPS[group];
  if (!tool || !g) return null;
  const D = tool.dia;
  const out = { warnings: [], info: [] };

  // effective diameter (ball nose in shallow 3D finishing; chamfer mills always)
  let Deff = D;
  if (tool.type === "ball_endmill" && op === "finish3d" && ap > 0 && ap < D / 2) {
    Deff = 2 * Math.sqrt(ap * (D - ap));
    out.info.push(`Ball effective Ø at ${fmt(ap, 4)}" DOC: ${fmt(Deff, 4)}" — RPM computed on effective Ø`);
  }
  if (tool.type === "chamfer_mill") {
    const half = (((tool.angle || 90) / 2) * Math.PI) / 180;
    const tip = tool.tipDia || 0;
    const engaged = tip + 2 * ap * Math.tan(half);
    Deff = Math.min(Math.max(engaged, tip || 0.02), D);
    if (engaged > D * 1.001) out.warnings.push({ level: "amber", msg: `This depth engages Ø${fmt(engaged, 3)}" — past the tool's max Ø${fmt(D, 3)}". Reduce chamfer depth.` });
    out.info.push(`Effective Ø at ${fmt(ap, 4)}" depth: ${fmt(Deff, 4)}" (${fmt(tool.angle || 90, 0)}° included, ${fmt(tip, 3)}" tip) — RPM computed on effective Ø. Chamfer leg ≈ ${fmt(ap * Math.tan(half), 4)}".`);
  }

  const rpmRaw = (sfm * 12) / (Math.PI * Deff);
  let rpm = rpmRaw;
  out.rpmRaw = rpmRaw;
  out.clamped = false;
  const maxR = machineMaxRpm(machine, curveId);
  if (maxR && rpmRaw > maxR) {
    rpm = maxR;
    out.clamped = true;
    const cfg = pickCont(machine, curveId);
    const cfgNote = cfg && Number.isFinite(cfg.maxRpm) && cfg.maxRpm > 0 && cfg.maxRpm < (machine.maxRpm || Infinity) ? ` (${cfg.label})` : "";
    out.warnings.push({ level: "amber", msg: `Wants ${fmt(rpmRaw, 0)} RPM — clamped to ${machine.name}${cfgNote} max ${fmt(maxR, 0)}. Effective ${fmt((rpm * Math.PI * Deff) / 12, 0)} SFM.` });
  }
  out.rpm = rpm;
  out.sfmActual = (rpm * Math.PI * Deff) / 12;

  if (tool.type === "tap") {
    const pitch = tool.pitch;
    out.mrr = 0; out.hp = 0; out.torque = 0;
    if (!Number.isFinite(pitch) || pitch <= 0) {
      out.feed = 0; out.fzProg = 0;
      out.warnings.push({ level: "red", msg: "No thread pitch on this tap — Edit it in the library to get a feed." });
    } else {
      out.feed = rpm * pitch;
      out.fzProg = pitch;
      out.info.push(`Rigid tapping: feed is locked to pitch (${fmt(pitch, 4)}"/rev = ${fmt(pitch * IN_MM, 2)} mm/rev). Program G84 and let the control sync — RPM is your only free variable.`);
    }
    powerCheck(out, machine, rpm, curveId);
    return out;
  }

  if (tool.type === "drill") {
    const iprUse = ipr;
    out.feed = rpm * iprUse;
    out.fzProg = iprUse;
    out.mrr = (Math.PI / 4) * D * D * out.feed;
    out.chipActual = iprUse / 2; // per lip, 2-flute assumption
    out.hp = out.mrr / g.uhp;
    out.torque = out.hp > 0 && rpm > 0 ? (out.hp * 5252) / rpm : 0;
    powerCheck(out, machine, rpm, curveId);
    return out;
  }

  if (tool.type === "chamfer_mill") {
    const zc = tool.flutes || 2;
    const half = (((tool.angle || 90) / 2) * Math.PI) / 180;
    out.fzProg = fz;
    out.chipActual = fz;
    out.feed = rpm * zc * fz;
    const leg = ap * Math.tan(half);
    out.mrr = 0.5 * ap * leg * out.feed; // triangular chamfer cross-section
    out.hp = out.mrr / g.uhp;
    out.torque = out.hp > 0 && rpm > 0 ? (out.hp * 5252) / rpm : 0;
    powerCheck(out, machine, rpm, curveId);
    return out;
  }

  // milling
  const z = tool.flutes || 2;
  const r = Math.min(Math.max(ae / D, 0.001), 1);
  const ctf = r < 0.5 ? 2 * Math.sqrt(r * (1 - r)) : 1; // hex = fz * ctf
  out.ctf = ctf;

  let fzProg;
  if (op === "adaptive") {
    fzProg = targetChip / ctf;
    out.info.push(`Chip thinning at ${fmt(r * 100, 1)}% engagement: programmed ${fmt(fzProg, 5)}" IPT to hold ${fmt(targetChip, 5)}" chip (×${fmt(1 / ctf, 2)})`);
    const fzCap = scaleIpt(0.014, D); // sanity ceiling
    if (fzProg > fzCap) {
      out.warnings.push({ level: "amber", msg: `Programmed IPT ${fmt(fzProg, 5)}" is very high — verify tool strength / edge prep before running.` });
    }
  } else {
    fzProg = fz;
    out.chipActual = fz * ctf;
    if (r < 0.5) out.info.push(`Actual max chip thickness: ${fmt(out.chipActual, 5)}" (thinned from ${fmt(fz, 5)}" IPT at ${fmt(r * 100, 1)}% stepover)`);
  }
  out.fzProg = fzProg;
  out.feed = rpm * z * fzProg;
  out.mrr = ae * ap * out.feed;
  out.hp = out.mrr / g.uhp;
  out.torque = out.hp > 0 && rpm > 0 ? (out.hp * 5252) / rpm : 0;

  // ball scallop for 3D finishing
  if (tool.type === "ball_endmill" && op === "finish3d" && ae > 0 && ae < D) {
    const R = D / 2;
    const scallop = R - Math.sqrt(Math.max(R * R - (ae / 2) * (ae / 2), 0));
    out.info.push(`Scallop height at ${fmt(ae, 4)}" stepover: ${fmt(scallop * 1000, 2)} thou (${fmt(scallop * IN_MM * 1000, 1)} µm)`);
  }

  // engagement sanity
  if (op === "slot" && ap > D * 1.05) out.warnings.push({ level: "amber", msg: `Slotting deeper than 1×Ø (${fmt(D, 3)}") in one pass — consider multiple stepdowns.` });
  if (op === "side" && ae > D * 0.55) out.warnings.push({ level: "amber", msg: `Radial engagement > 0.5×Ø in conventional side milling — heavy cut, watch deflection.` });
  if (mode === "finish" && ae > 0.025) out.info.push(`Finishing tip: typical stock-to-leave for this material is ${fmt(g.stock[0], 3)}"–${fmt(g.stock[1], 3)}" radial. Spring passes recommended on toleranced walls.`);

  powerCheck(out, machine, rpm, curveId);
  return out;
}

function powerCheck(out, machine, rpm, curveId) {
  const avail = availableHp(machine, rpm, curveId);
  if (avail == null) return;
  const cont = pickCont(machine, curveId);
  out.hpAvail = avail;
  out.hpSrc = cont && cont.points?.length > 1 ? "curve" : "flat";
  out.curveLabel = out.hpSrc === "curve" ? cont.label || "" : "";
  const burst = availableBurstHp(machine, rpm, curveId);
  if (burst != null) out.hpBurst = burst;
  out.hpPct = avail > 0 ? out.hp / avail : Infinity;
  if (out.hp <= 0) return;
  if (out.hpPct > 1) {
    if (burst != null && out.hp <= burst) {
      out.warnings.push({ level: "amber", msg: `Needs ${fmt(out.hp, 1)} HP — over ${machine.name}'s continuous rating (${fmt(avail, 1)} HP at ${fmt(rpm, 0)} RPM) but inside the burst rating (${fmt(burst, 1)} HP). Fine for short engagements; back it off for sustained roughing or the spindle will derate.` });
    } else {
      out.warnings.push({ level: "red", msg: `Needs ${fmt(out.hp, 1)} HP at the tool — only ${fmt(avail, 1)} HP available at ${fmt(rpm, 0)} RPM${out.hpSrc === "flat" ? ` (${machine.name} flat rating)` : ` on ${machine.name}'s ${out.curveLabel || "spindle"} curve`}${burst != null ? `; even the burst rating (${fmt(burst, 1)} HP) is exceeded` : ""}. Reduce DOC/WOC or feed.` });
    }
  } else if (out.hpPct > 0.8) {
    out.warnings.push({ level: "amber", msg: `${fmt(out.hpPct * 100, 0)}% of available spindle power at this RPM — near the limit.` });
  }
}

/* seed sfm / fz for a tool+group+mode from library data or generic tables */
function seedParams(tool, group, mode, op) {
  const g = GROUPS[group];
  const lib = tool?.cutting?.[group];
  if (tool?.type === "tap") {
    const s = lib && Number.isFinite(lib.sfmLo) ? (lib.sfmLo + lib.sfmHi) / 2 : g.sfm[0] * 0.3;
    return { sfm: Math.round(s), ipt: null, source: lib ? (lib.src || "manufacturer") : "generic" };
  }
  let sfm, ipt, source;
  if (lib && Number.isFinite(lib.sfmLo)) {
    sfm = mode === "rough" ? (lib.sfmLo + lib.sfmHi) / 2 : Math.min(lib.sfmHi, ((lib.sfmLo + lib.sfmHi) / 2) * FINISH_SFM_FACTOR);
    ipt = mode === "rough" ? (lib.iptLo + lib.iptHi) / 2 : Math.max(lib.iptLo, ((lib.iptLo + lib.iptHi) / 2) * FINISH_FZ_FACTOR);
    source = lib.src || "manufacturer";
  } else {
    sfm = mode === "rough" ? (g.sfm[0] + g.sfm[1]) / 2 : Math.min(g.sfm[1], ((g.sfm[0] + g.sfm[1]) / 2) * FINISH_SFM_FACTOR);
    const base = tool?.type === "drill" ? null : scaleIpt(g.ipt, tool?.dia || 0.5);
    ipt = base != null ? (mode === "rough" ? base : base * FINISH_FZ_FACTOR) : null;
    if (tool?.type === "drill") {
      sfm = sfm * DRILL.sfmFactor;
      ipt = DRILL.iprAtHalf[group] * Math.pow((tool.dia || 0.5) / 0.5, 0.8);
    }
    source = "generic";
  }
  if (op === "slot" && ipt != null && tool?.type !== "drill") ipt *= 0.8; // catalog convention: slotting IPT = side milling −20%
  if (tool?.type === "chamfer_mill" && ipt != null) ipt *= 0.75; // light chip on small effective Ø / weak tip
  return { sfm: Math.round(sfm), ipt: ipt != null ? +ipt.toFixed(5) : null, source };
}

/* ============================================================
   UI PRIMITIVES
   ============================================================ */
function Field({ label, unit, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}{unit ? <em>{unit}</em> : null}</span>
      {children}
    </label>
  );
}

function NumInput({ value, onChange, step, min, disabled, metric, isLength, isFeedPerTooth, digits = 4 }) {
  // metric display conversion: lengths in mm, ipt in mm too
  const toDisp = (v) => (metric && (isLength || isFeedPerTooth) ? v * IN_MM : v);
  const fromDisp = (v) => (metric && (isLength || isFeedPerTooth) ? v / IN_MM : v);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(Number.isFinite(value) ? String(+toDisp(value).toFixed(digits)) : "");
  }, [value, metric, editing]); // eslint-disable-line
  return (
    <input
      className="num" type="number" step={step || "any"} min={min} disabled={disabled} value={text}
      onFocus={() => setEditing(true)}
      onBlur={() => { setEditing(false); const n = parseFloat(text); if (Number.isFinite(n)) onChange(fromDisp(n)); }}
      onChange={(e) => { setText(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange(fromDisp(n)); }}
    />
  );
}

function Chip({ active, onClick, children }) {
  return <button className={"chip" + (active ? " chip-on" : "")} onClick={onClick}>{children}</button>;
}

/* Dropdown that can show icons/colors per row — native <option> can't hold markup.
   options: [{ value, icon?, label, sub?, text }] where `text` is the plain-text
   fallback used for the closed button and type-ahead. */
function IconSelect({ value, onChange, options, placeholder = "— select —", disabled }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0); // keyboard-highlighted row
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const cur = options.find((o) => o.value === value) || null;

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);
  useEffect(() => {
    if (open) setHi(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open]); // eslint-disable-line
  useEffect(() => {
    if (open) listRef.current?.querySelector(".isel-opt.hi")?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  /* Field wraps children in a <label>; clicking a non-interactive element inside a
     label makes the browser forward a synthetic click to the label's control (this
     button), which would instantly re-toggle it. Making the trigger and every option
     real <button>s (interactive content) exempts them from that forwarding per spec. */
  const pick = (v) => { onChange(v); setOpen(false); };
  const onKeyDown = (e) => {
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === "Escape") { setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (options[hi]) pick(options[hi].value); }
    else if (e.key.length === 1) {
      const q = e.key.toLowerCase();
      const i = options.findIndex((o, j) => j > hi && (o.text || "").toLowerCase().startsWith(q));
      const k = i >= 0 ? i : options.findIndex((o) => (o.text || "").toLowerCase().startsWith(q));
      if (k >= 0) setHi(k);
    }
  };

  return (
    <div className={"isel" + (open ? " open" : "")} ref={wrapRef}>
      <button type="button" className="num isel-btn" disabled={disabled} onKeyDown={onKeyDown}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox" aria-expanded={open}>
        <span className="isel-cur">
          {cur?.icon}
          <span className="isel-txt">{cur ? cur.label : placeholder}</span>
          {cur?.sub && <span className="dim isel-sub">{cur.sub}</span>}
        </span>
        <span className="isel-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="isel-list" role="listbox" ref={listRef} onKeyDown={onKeyDown} tabIndex={-1}>
          {options.map((o, i) => (
            <button type="button" key={o.value} role="option" aria-selected={o.value === value}
              className={"isel-opt" + (i === hi ? " hi" : "") + (o.value === value ? " sel" : "")}
              onMouseEnter={() => setHi(i)} onClick={() => pick(o.value)}>
              {o.icon}
              <span className="isel-opt-txt">
                <span>{o.label}</span>
                {o.sub && <span className="dim">{o.sub}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   APP
   ============================================================ */
export default function App() {
  const [tab, setTab] = useState("calc");
  const [machines, setMachines] = useState([]);
  const [tools, setTools] = useState([]);
  const [metric, setMetric] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const d = await loadAll();
      if (d) { setMachines((d.machines || []).map(migrateMachine)); setTools(d.tools || []); setMetric(!!d.metric); }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveAll({ machines, tools, metric }), 400);
  }, [machines, tools, metric, loaded]);

  const importRef = useRef(null);
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ app: "feeds-speeds-workbench", v: 1, machines, tools }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "shop-data.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const importData = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      const inM = Array.isArray(d.machines) ? d.machines : [];
      const inT = Array.isArray(d.tools) ? d.tools : [];
      let addM = 0, addT = 0;
      setMachines((prev) => {
        const have = new Set(prev.map((m) => m.name.toLowerCase()));
        const fresh = inM.filter((m) => m?.name && !have.has(m.name.toLowerCase())).map(migrateMachine);
        addM = fresh.length;
        return [...prev, ...fresh];
      });
      setTools((prev) => {
        const have = new Set(prev.map((t) => (t.brand + "|" + t.pn + "|" + t.dia).toLowerCase()));
        const fresh = inT.filter((t) => t?.dia && !have.has((t.brand + "|" + t.pn + "|" + t.dia).toLowerCase()));
        addT = fresh.length;
        return [...prev, ...fresh];
      });
      setTimeout(() => alert(`Imported ${addM} machine(s) and ${addT} tool(s). Duplicates were skipped.`), 50);
    } catch { alert("Couldn't read that file — expected a shop-data.json exported from this app."); }
  };

  return (
    <div className="app">
      <style>{CSS}</style>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            <h1>Feeds &amp; Speeds Workbench</h1>
            <p>Manufacturer data first · physics fallback always</p>
          </div>
        </div>
        <div className="topbar-right">
          <button className="btn sm" onClick={exportData} title="Download your machines + tool library as a JSON file to back up or hand to a coworker">Export</button>
          <button className="btn sm" onClick={() => importRef.current?.click()} title="Merge a shop-data.json into your library (duplicates skipped)">Import</button>
          <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={importData} />
          <div className="unit-toggle" role="group" aria-label="Units">
            <button className={!metric ? "on" : ""} onClick={() => setMetric(false)}>inch</button>
            <button className={metric ? "on" : ""} onClick={() => setMetric(true)}>mm</button>
          </div>
        </div>
      </header>

      <nav className="tabs">
        {[["calc", "Calculator"], ["tools", `Tool library (${tools.length})`], ["machines", `Machines (${machines.length})`]].map(([k, l]) => (
          <button key={k} className={tab === k ? "tab on" : "tab"} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      {!loaded ? <div className="loading">Loading your shop data…</div> : (
        /* all tabs stay mounted (hidden with display:none) so lookup queues and
           AI curve searches keep running while you navigate around the app */
        <main>
          <div style={{ display: tab === "machines" ? "" : "none" }}><Machines machines={machines} setMachines={setMachines} /></div>
          <div style={{ display: tab === "tools" ? "" : "none" }}><Tools tools={tools} setTools={setTools} metric={metric} /></div>
          <div style={{ display: tab === "calc" ? "" : "none" }}><Calculator machines={machines} tools={tools} setTools={setTools} metric={metric} goTo={setTab} /></div>
        </main>
      )}
    </div>
  );
}

/* ============================================================
   MACHINES TAB
   ============================================================ */
function Machines({ machines, setMachines }) {
  const blank = { name: "", maxRpm: "", hp: "", notes: "", curves: [] };
  const [draft, setDraft] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [curveFor, setCurveFor] = useState(null); // "draft" or a machine id receiving the next uploaded curve
  const [curveBusy, setCurveBusy] = useState(false);
  const [curveErr, setCurveErr] = useState("");
  const [curveDraft, setCurveDraft] = useState(null); // review state: {target, srcName, notes, raw?:pairs, unit?, points?, label, duty, maxRpm}
  const [aiBusy, setAiBusy] = useState(null); // "draft" or machine id being searched
  const [aiDraft, setAiDraft] = useState(null); // review state: {target, targetName, machine, curves:[{checked,...}], sources, notes}
  const [aiProgress, setAiProgress] = useState(""); // latest milestone from the Worker's SSE stream
  const curveFileRef = useRef(null);
  const aiElapsed = useElapsed(aiBusy);

  const targetName = (t) => (t === "draft" ? (draft.name.trim() || "new machine") : machines.find((m) => m.id === t)?.name || "machine");
  const targetCurves = (t) => (t === "draft" ? draft.curves : machines.find((m) => m.id === t)?.curves || []);
  const appendCurves = (t, add) => {
    if (t === "draft") setDraft((p) => ({ ...p, curves: [...p.curves, ...add] }));
    else setMachines((prev) => prev.map((m) => (m.id === t ? { ...m, curves: [...(m.curves || []), ...add] } : m)));
  };

  const commit = () => {
    if (!draft.name.trim() || !parseFloat(draft.maxRpm)) return;
    const m = { id: editId || String(Date.now()), name: draft.name.trim(), maxRpm: parseFloat(draft.maxRpm), hp: parseFloat(draft.hp) || null, notes: draft.notes.trim(), curves: draft.curves };
    setMachines((prev) => editId ? prev.map((x) => (x.id === editId ? { ...x, ...m } : x)) : [...prev, m]);
    setDraft(blank); setEditId(null);
  };
  const startEdit = (m) => { setDraft({ name: m.name, maxRpm: m.maxRpm, hp: m.hp ?? "", notes: m.notes || "", curves: m.curves || [] }); setEditId(m.id); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const pickCurve = (target) => { setCurveFor(target); setCurveErr(""); curveFileRef.current?.click(); };

  const onCurveFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const target = curveFor;
    if (!file || !target) return;
    setCurveErr(""); setCurveDraft(null);
    const defaults = { target, label: targetCurves(target).length ? "" : "S1 continuous", duty: "continuous", maxRpm: "" };
    const isCsv = /\.(csv|txt|tsv)$/i.test(file.name) || (file.type || "").includes("csv") || (file.type || "").includes("text");
    if (isCsv) {
      const raw = parseCurvePairs(await file.text());
      if (raw.length < 2) { setCurveErr("Couldn't find RPM + value pairs in that file. Expected rows like: 2000, 22.5"); return; }
      setCurveDraft({ ...defaults, srcName: file.name, raw, unit: "hp", notes: `${raw.length} rows parsed — first column read as RPM.` });
    } else {
      setCurveBusy(true);
      try {
        const res = await digitizeCurve(file);
        if (!res.found || !(res.points?.length >= 2)) {
          setCurveErr("Couldn't find a power/torque curve in that file. " + (res.notes || ""));
        } else {
          const points = res.points.filter((p) => Number.isFinite(p.rpm) && Number.isFinite(p.hp)).sort((a, b) => a.rpm - b.rpm);
          setCurveDraft({ ...defaults, srcName: file.name, points, notes: res.notes || "" });
        }
      } catch (err) { setCurveErr("Digitization failed (" + (err.message || "error") + "). A cropped screenshot of just the chart usually works best."); }
      setCurveBusy(false);
    }
  };

  const draftPoints = curveDraft
    ? (curveDraft.points || curveDraft.raw.map((p) => ({ rpm: p.x, hp: CURVE_UNITS[curveDraft.unit].conv(p.y, p.x) })).sort((a, b) => a.rpm - b.rpm))
    : null;

  const saveCurve = () => {
    if (!draftPoints || draftPoints.length < 2) return;
    const maxRpm = parseFloat(curveDraft.maxRpm);
    appendCurves(curveDraft.target, [{
      id: curveUid(),
      label: curveDraft.label.trim() || curveDraft.srcName,
      duty: curveDraft.duty,
      maxRpm: Number.isFinite(maxRpm) && maxRpm > 0 ? maxRpm : null,
      points: draftPoints,
      srcName: curveDraft.srcName,
    }]);
    setCurveDraft(null); setCurveFor(null);
  };

  const aiFind = async (target) => {
    const m = target === "draft"
      ? { name: draft.name.trim(), maxRpm: parseFloat(draft.maxRpm) || null, notes: draft.notes }
      : machines.find((x) => x.id === target);
    if (!m?.name) return;
    setCurveErr(""); setAiDraft(null); setAiBusy(target); setAiProgress("");
    try {
      const res = await findMachineCurves(m, setAiProgress);
      const curves = (res.curves || [])
        .map((c) => ({
          checked: true,
          label: c.label || "Curve",
          duty: c.duty === "burst" ? "burst" : "continuous",
          maxRpm: Number.isFinite(c.max_rpm) && c.max_rpm > 0 ? c.max_rpm : null,
          points: (c.points || []).filter((p) => Number.isFinite(p.rpm) && Number.isFinite(p.hp)).sort((a, b) => a.rpm - b.rpm),
          notes: c.notes || "",
        }))
        .filter((c) => c.points.length >= 2);
      if (!res.found || !curves.length) {
        setCurveErr(`Couldn't find published curve data for "${m.name}" on the web. ${res.notes || ""} A screenshot of the chart from the manual still works — hit Upload curve.`);
      } else {
        setAiDraft({ target, targetName: m.name, machine: res.machine || m.name, curves, sources: res.sources || [], notes: res.notes || "" });
      }
    } catch (err) {
      setCurveErr("Curve search failed (" + (err.message || "error") + "). Try again in a minute.");
    }
    setAiBusy(null);
  };

  const saveAiCurves = () => {
    const add = aiDraft.curves.filter((c) => c.checked).map((c) => ({
      id: curveUid(), label: c.label.trim() || "Curve", duty: c.duty, maxRpm: c.maxRpm, points: c.points, srcName: "AI web search",
    }));
    if (add.length) appendCurves(aiDraft.target, add);
    setAiDraft(null);
  };
  const setAiCurve = (i, patch) => setAiDraft((p) => ({ ...p, curves: p.curves.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const setDraftCurve = (id, patch) => setDraft((p) => ({ ...p, curves: p.curves.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const dropDraftCurve = (id) => setDraft((p) => ({ ...p, curves: p.curves.filter((c) => c.id !== id) }));
  const draftCont = draft.curves.filter((c) => c.duty !== "burst");

  const busy = curveBusy || !!aiBusy;

  return (
    <section className="panel">
      <h2>Machines</h2>
      <p className="hint">Max spindle RPM clamps everything. Give a machine its power/torque curves — upload a manual PDF, a chart screenshot, or a CSV of RPM,value rows, or let AI search the web for the published data. A machine can hold several curves: continuous (S1) vs burst duty ratings, low/high belt ranges, or separate spindles — the calculator checks power on the right one at your <em>actual</em> RPM.</p>
      <div className="grid-form">
        <Field label="Name"><input className="num txt" placeholder="Haas VF-2" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
        <Field label="Max spindle" unit="RPM"><input className="num" type="number" placeholder="10000" value={draft.maxRpm} onChange={(e) => setDraft({ ...draft, maxRpm: e.target.value })} /></Field>
        <Field label="Rated power (fallback)" unit="HP"><input className="num" type="number" placeholder="30" value={draft.hp} onChange={(e) => setDraft({ ...draft, hp: e.target.value })} /></Field>
        <Field label="Notes"><input className="num txt" placeholder="CAT40, TSC…" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
      </div>

      {draft.curves.length > 0 && (
        <div className="curve-list">
          {draft.curves.map((c) => {
            const peak = c.points.reduce((a, p) => (p.hp > a.hp ? p : a), c.points[0]);
            return (
              <div className="curve-row" key={c.id}>
                <Spark pts={c.points} w={120} h={30} />
                <input className="num txt sm-in curve-label" value={c.label} onChange={(e) => setDraftCurve(c.id, { label: e.target.value })} />
                <select className="num auto" value={c.duty} onChange={(e) => setDraftCurve(c.id, { duty: e.target.value })}>
                  <option value="continuous">continuous</option>
                  <option value="burst">burst</option>
                </select>
                {c.duty === "burst" && draftCont.length > 1 && (
                  <select className="num auto" value={c.forId || ""} onChange={(e) => setDraftCurve(c.id, { forId: e.target.value || null })} title="Which configuration this burst rating belongs to">
                    <option value="">any config</option>
                    {draftCont.map((cc) => <option key={cc.id} value={cc.id}>{cc.label}</option>)}
                  </select>
                )}
                <span className="dim mono">{c.points.length} pts · peak {fmt(peak.hp, 1)} HP{Number.isFinite(c.maxRpm) && c.maxRpm ? ` · to ${fmt(c.maxRpm, 0)} RPM` : ""}</span>
                <button className="btn sm danger" onClick={() => dropDraftCurve(c.id)} title="Remove this curve">×</button>
              </div>
            );
          })}
        </div>
      )}
      <div className="row-btns">
        <button className="btn primary" onClick={commit}>{editId ? "Save changes" : "Add machine"}</button>
        <button className="btn" disabled={busy} onClick={() => pickCurve("draft")} title="Attach a power/torque curve to this machine: PDF, chart screenshot, or CSV">Upload curve</button>
        <button className="btn" disabled={busy || !draft.name.trim()} onClick={() => aiFind("draft")} title="Search the web for this machine's published power/torque curves">{aiBusy === "draft" ? "Searching…" : "Find curves with AI"}</button>
        {editId && <button className="btn" onClick={() => { setDraft(blank); setEditId(null); }}>Cancel</button>}
      </div>
      <input ref={curveFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.csv,.txt,.tsv" style={{ display: "none" }} onChange={onCurveFile} />
      {curveBusy && <div className="notice info">Reading the curve with AI vision — pulling 12–24 points off the chart. Usually 15–30 seconds…</div>}
      {aiBusy && (
        <div className="notice info">
          <div className="prog-row">
            <span>Searching the web for <strong>{targetName(aiBusy)}</strong>'s published power/torque curves — manuals, spec sheets, brochures. Usually 2–5 minutes (it retries on upstream hiccups); safe to switch tabs, this keeps running.</span>
            <span className="mono dim">{aiElapsed}</span>
          </div>
          <div className="milestone">{aiProgress || "Contacting the AI…"}</div>
          <div className="prog indet"><i /></div>
        </div>
      )}
      {curveErr && <div className="notice amber">{curveErr}</div>}

      {curveDraft && draftPoints && (
        <div className="card">
          <h3>Power curve for {targetName(curveDraft.target)} — review before saving</h3>
          <p className="hint">{curveDraft.srcName} · {draftPoints.length} points · peak {fmt(draftPoints.reduce((a, p) => (p.hp > a.hp ? p : a), draftPoints[0]).hp, 1)} HP @ {fmt(draftPoints.reduce((a, p) => (p.hp > a.hp ? p : a), draftPoints[0]).rpm, 0)} RPM{curveDraft.notes ? " · " + curveDraft.notes : ""}</p>
          {curveDraft.raw && (
            <div className="chip-row" style={{ marginBottom: 8 }}>
              <span className="chip-label">2nd column is</span>
              {Object.entries(CURVE_UNITS).map(([k, u]) => (
                <Chip key={k} active={curveDraft.unit === k} onClick={() => setCurveDraft((p) => ({ ...p, unit: k }))}>{u.label}</Chip>
              ))}
            </div>
          )}
          <div className="grid-form">
            <Field label="Curve name"><input className="num txt" placeholder="S1 continuous, Low belt, Main spindle…" value={curveDraft.label} onChange={(e) => setCurveDraft((p) => ({ ...p, label: e.target.value }))} /></Field>
            <Field label="Duty">
              <select className="num" value={curveDraft.duty} onChange={(e) => setCurveDraft((p) => ({ ...p, duty: e.target.value }))}>
                <option value="continuous">Continuous (S1 / 100%)</option>
                <option value="burst">Burst (S6 / 30-min / peak)</option>
              </select>
            </Field>
            <Field label="Config max RPM (optional)" unit="RPM"><input className="num" type="number" placeholder="only if below machine max" value={curveDraft.maxRpm} onChange={(e) => setCurveDraft((p) => ({ ...p, maxRpm: e.target.value }))} /></Field>
          </div>
          <Spark pts={draftPoints} w={560} h={130} />
          <div className="row-btns">
            <button className="btn primary" onClick={saveCurve}>Save curve</button>
            <button className="btn" onClick={() => { setCurveDraft(null); setCurveFor(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {aiDraft && (
        <div className="card">
          <h3>AI found {aiDraft.curves.length} curve{aiDraft.curves.length > 1 ? "s" : ""} for {aiDraft.targetName} — review before saving</h3>
          <p className="hint">Matched: {aiDraft.machine}{aiDraft.notes ? " · " + aiDraft.notes : ""} Sanity-check the shapes against the manual — this came from a web search, not your machine.</p>
          {aiDraft.curves.map((c, i) => {
            const peak = c.points.reduce((a, p) => (p.hp > a.hp ? p : a), c.points[0]);
            return (
              <div className="curve-row ai" key={i}>
                <input type="checkbox" checked={c.checked} onChange={() => setAiCurve(i, { checked: !c.checked })} />
                <Spark pts={c.points} w={170} h={44} />
                <div className="curve-meta">
                  <div className="curve-meta-top">
                    <input className="num txt sm-in curve-label" value={c.label} onChange={(e) => setAiCurve(i, { label: e.target.value })} />
                    <select className="num auto" value={c.duty} onChange={(e) => setAiCurve(i, { duty: e.target.value })}>
                      <option value="continuous">continuous</option>
                      <option value="burst">burst</option>
                    </select>
                    <span className="dim mono">{c.points.length} pts · peak {fmt(peak.hp, 1)} HP @ {fmt(peak.rpm, 0)}{Number.isFinite(c.maxRpm) && c.maxRpm ? ` · to ${fmt(c.maxRpm, 0)} RPM` : ""}</span>
                  </div>
                  {c.notes && <span className="dim">{c.notes}</span>}
                </div>
              </div>
            );
          })}
          {aiDraft.sources.length > 0 && <p className="hint dim">Sources: {aiDraft.sources.slice(0, 4).map((s, i) => <a key={i} href={s} target="_blank" rel="noreferrer">[{i + 1}] </a>)}</p>}
          <div className="row-btns">
            <button className="btn primary" onClick={saveAiCurves} disabled={!aiDraft.curves.some((c) => c.checked)}>Save selected</button>
            <button className="btn" onClick={() => setAiDraft(null)}>Cancel</button>
          </div>
        </div>
      )}

      {machines.length === 0 ? <div className="empty">No machines yet. Add your VF-2 and friends above — they'll be here every session.</div> : (
        <table className="tbl">
          <thead><tr><th>Machine</th><th>Max RPM</th><th>Power</th><th>Notes</th><th /></tr></thead>
          <tbody>
            {machines.map((m) => (
              <tr key={m.id}>
                <td className="mono strong"><BrandIcon name={m.name} />{m.name}</td>
                <td className="mono">{fmt(m.maxRpm, 0)}</td>
                <td>{(m.curves || []).length > 0
                  ? <div className="curve-cell">
                      {m.curves.map((c) => (
                        <div className="curve-mini" key={c.id}>
                          <Spark pts={c.points} w={120} h={30} />
                          <span className="dim">{c.label}{c.duty === "burst" ? " · burst" : ""} · peak {fmt(Math.max(...c.points.map((p) => p.hp)), 1)} HP</span>
                        </div>
                      ))}
                    </div>
                  : <span className="dim">{Number.isFinite(m.hp) && m.hp ? m.hp + " HP flat" : "—"}</span>}</td>
                <td>{m.notes}</td>
                <td className="row-actions">
                  <button className="btn sm" disabled={busy} onClick={() => pickCurve(m.id)} title="Add a power/torque curve: PDF, chart screenshot, or CSV">Curve +</button>
                  <button className="btn sm" disabled={busy} onClick={() => aiFind(m.id)} title="Search the web for this machine's published power/torque curves">{aiBusy === m.id ? "Searching…" : "AI find"}</button>
                  <button className="btn sm" onClick={() => startEdit(m)}>Edit</button>
                  <button className="btn sm danger" onClick={() => setMachines((p) => p.filter((x) => x.id !== m.id))}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Spark({ pts, w = 120, h = 34 }) {
  if (!pts || pts.length < 2) return null;
  const s = [...pts].sort((a, b) => a.rpm - b.rpm);
  const xMin = s[0].rpm, xMax = s[s.length - 1].rpm || 1;
  const yMax = Math.max(...s.map((p) => p.hp)) || 1;
  const X = (r) => 2 + ((r - xMin) / (xMax - xMin || 1)) * (w - 4);
  const Y = (v) => h - 2 - (v / yMax) * (h - 6);
  const d = s.map((p, i) => (i ? "L" : "M") + X(p.rpm).toFixed(1) + " " + Y(p.hp).toFixed(1)).join(" ");
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="spindle power curve">
      <path d={d + ` L${X(s[s.length - 1].rpm).toFixed(1)} ${h - 1} L${X(s[0].rpm).toFixed(1)} ${h - 1} Z`} className="spark-fill" />
      <path d={d} className="spark-line" fill="none" />
    </svg>
  );
}

/* ============================================================
   TOOLS TAB — library + AI lookup
   ============================================================ */
function emptyTool() {
  return { id: String(Date.now()) + Math.random().toString(36).slice(2, 5), brand: "", pn: "", series: "", name: "", type: "square_endmill", dia: 0.5, flutes: 3, coating: "", loc: null, angle: null, tipDia: null, cutting: {}, source: "user", notes: "" };
}

function Tools({ tools, setTools, metric }) {
  const [lookupBrand, setLookupBrand] = useState("");
  const [lookupPn, setLookupPn] = useState("");
  const [queue, setQueue] = useState([]); // jobs: {kind:'new',brand,pn} | {kind:'enrich',id}
  const [active, setActive] = useState(null); // job currently searching
  const [lookupErr, setLookupErr] = useState("");
  const [candidates, setCandidates] = useState([]); // finished lookups awaiting review: [{tool, meta}]
  const [manual, setManual] = useState(null); // manual-entry tool draft
  const [importList, setImportList] = useState(null); // [{tool, checked}]
  const [importSkipped, setImportSkipped] = useState([]);
  const [sel, setSel] = useState(() => new Set()); // multi-selected tool ids
  const [tFType, setTFType] = useState("all");
  const [tFBrand, setTFBrand] = useState("all");
  const [tFDia, setTFDia] = useState("all");
  const [tFData, setTFData] = useState("all");
  const [sort, setSort] = useState({ k: "dia", d: 1 });
  const [batch, setBatch] = useState({ total: 0, done: 0 });
  const [progress, setProgress] = useState(""); // latest milestone from the Worker's SSE stream
  const fileRef = useRef(null);
  const toolsRef = useRef(tools);
  useEffect(() => { toolsRef.current = tools; }, [tools]);
  const elapsed = useElapsed(active);

  // sequential queue processor — one web lookup at a time, results stack up below for review
  useEffect(() => {
    if (active || queue.length === 0) return;
    const job = queue[0];
    setQueue((q) => q.slice(1));
    setActive(job);
    setProgress("");
    (async () => {
      try {
        const existing = job.kind === "enrich" ? toolsRef.current.find((t) => t.id === job.id) : null;
        const brand = (job.kind === "enrich" ? existing?.brand : job.brand) || "unknown brand";
        const pnq = job.kind === "enrich" ? (existing?.pn || existing?.name) : job.pn;
        const res = await lookupTool(brand, pnq, setProgress);
        if (!res.found || !res.tool) {
          if (job.kind === "new") {
            setLookupErr(`Couldn't identify "${brand} ${pnq}" on the web. Enter it manually — generic tables will be used until you add numbers.`);
            setManual({ ...emptyTool(), brand: job.brand, pn: job.pn });
          } else {
            setLookupErr(`No web data found for "${brand} ${pnq}" — it keeps its current data. You can enter catalog numbers via Edit.`);
          }
        } else {
          const t = res.tool;
          const cutting = { ...(existing?.cutting || {}) };
          (res.cutting || []).forEach((c) => { if (GROUPS[c.group]) cutting[c.group] = { sfmLo: c.sfm_lo, sfmHi: c.sfm_hi, iptLo: c.ipt_lo, iptHi: c.ipt_hi, src: "manufacturer" }; });
          const base = existing || { ...emptyTool(), source: "lookup" };
          const merged = {
            ...base,
            brand: base.brand || t.brand || "",
            pn: base.pn || t.pn || (job.kind === "new" ? job.pn : ""),
            series: t.series || base.series || "",
            name: base.name || t.name || "",
            type: existing?.type || (TOOL_TYPES[t.type] ? t.type : "square_endmill"),
            dia: existing?.dia || t.dia_in || 0.5,
            flutes: existing?.flutes || t.flutes || 2,
            coating: base.coating || t.coating || "",
            loc: base.loc ?? t.loc_in ?? null,
            angle: base.angle ?? t.included_angle_deg ?? null,
            tipDia: base.tipDia ?? t.tip_dia_in ?? null,
            pitch: base.pitch ?? t.pitch_in ?? null,
            metricTool: base.metricTool ?? !!t.metric_callout,
            cutting, source: Object.keys(cutting).length ? "manufacturer" : (existing ? existing.source : "lookup-no-data"),
            sources: (res.sources && res.sources.length ? res.sources : base.sources) || [],
            notes: res.notes || base.notes || "",
          };
          setCandidates((p) => [...p.filter((c) => c.tool.id !== merged.id), { tool: merged, meta: { confidence: res.confidence, sources: res.sources || [], noData: !Object.keys(cutting).length } }]);
        }
      } catch (e) {
        setLookupErr("Lookup failed (" + (e.message || "error") + "). Try again or add data via Edit.");
      }
      setBatch((b) => (b.total ? { ...b, done: b.done + 1 } : b));
      setActive(null);
    })();
  }, [queue, active]); // eslint-disable-line

  // clear the progress bar a beat after the batch completes
  useEffect(() => {
    if (batch.total > 0 && batch.done >= batch.total && queue.length === 0 && !active) {
      const t = setTimeout(() => setBatch({ total: 0, done: 0 }), 2500);
      return () => clearTimeout(t);
    }
  }, [batch, queue, active]);

  const queuedIds = new Set(queue.filter((j) => j.kind === "enrich").map((j) => j.id));
  const activeId = active?.kind === "enrich" ? active.id : null;
  const pendingCount = queue.length + (active ? 1 : 0);
  const jobLabel = (j) => {
    if (!j) return "";
    if (j.kind === "new") return `${j.brand || "?"} ${j.pn}`;
    const t = toolsRef.current.find((x) => x.id === j.id);
    return t ? toolLabel(t, metric) : "tool";
  };

  const enqueueEnrich = (t) => {
    if (activeId === t.id || queuedIds.has(t.id)) return;
    setLookupErr("");
    setBatch((b) => ({ total: b.total + 1, done: b.done }));
    setQueue((q) => [...q, { kind: "enrich", id: t.id }]);
  };

  /* filtering + sorting for the library table */
  const brands = useMemo(() => [...new Set(tools.map((t) => t.brand).filter(Boolean))].sort(), [tools]);
  const diaOpts = useMemo(() => {
    const m = new Map();
    [...tools].sort((a, b) => a.dia - b.dia).forEach((t) => { if (Number.isFinite(t.dia) && !m.has(String(t.dia))) m.set(String(t.dia), toolDiaLabel(t, metric)); });
    return [...m.entries()];
  }, [tools, metric]);
  const visible = useMemo(() => {
    const arr = tools.filter((t) =>
      (tFType === "all" || t.type === tFType) &&
      (tFBrand === "all" || t.brand === tFBrand) &&
      (tFDia === "all" || String(t.dia) === tFDia) &&
      (tFData === "all" || (tFData === "mfg" ? hasMfgData(t) : !hasMfgData(t)))
    );
    const key = {
      dia: (t) => t.dia,
      name: (t) => toolLabel(t, metric).toLowerCase(),
      type: (t) => t.type,
      flutes: (t) => t.flutes || 0,
      coating: (t) => (t.coating || "zz").toLowerCase(),
      loc: (t) => (Number.isFinite(t.loc) ? t.loc : 0),
      data: (t) => (hasMfgData(t) ? Object.keys(t.cutting).join("") : "zz"),
    }[sort.k] || ((t) => t.dia);
    return arr.sort((a, b) => { const ka = key(a), kb = key(b); return (ka < kb ? -1 : ka > kb ? 1 : a.dia - b.dia) * sort.d; });
  }, [tools, tFType, tFBrand, tFDia, tFData, sort, metric]);
  const clickSort = (k) => setSort((s) => (s.k === k ? { k, d: -s.d } : { k, d: 1 }));
  const arrow = (k) => (sort.k === k ? (sort.d === 1 ? " ▲" : " ▼") : "");

  /* multi-select */
  const allVisSelected = visible.length > 0 && visible.every((t) => sel.has(t.id));
  const toggleAll = () => setSel((p) => {
    const n = new Set(p);
    if (allVisSelected) visible.forEach((t) => n.delete(t.id));
    else visible.forEach((t) => n.add(t.id));
    return n;
  });
  const toggleSel = (id) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selTools = tools.filter((t) => sel.has(t.id));
  const bulkDelete = () => {
    if (!selTools.length) return;
    if (!window.confirm(`Delete ${selTools.length} tool${selTools.length > 1 ? "s" : ""} from the library? This can't be undone.`)) return;
    setTools((prev) => prev.filter((t) => !sel.has(t.id)));
    setSel(new Set());
  };
  const bulkLookup = () => {
    const targets = selTools.filter((t) => activeId !== t.id && !queuedIds.has(t.id));
    if (!targets.length) return;
    setLookupErr("");
    setBatch((b) => ({ total: b.total + targets.length, done: b.done }));
    setQueue((q) => [...q, ...targets.map((t) => ({ kind: "enrich", id: t.id }))]);
  };

  const onFusionFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLookupErr(""); setImportList(null); setImportSkipped([]);
    try {
      const buf = await file.arrayBuffer();
      let jsons;
      if (file.name.toLowerCase().endsWith(".json")) jsons = [new TextDecoder().decode(buf)];
      else jsons = (await unzipEntries(buf)).filter((x) => x.name.toLowerCase().endsWith(".json")).map((x) => x.text);
      const mapped = []; const skipped = {};
      for (const txt of jsons) {
        let obj; try { obj = JSON.parse(txt); } catch { continue; }
        const arr = obj.data || obj.tools || (Array.isArray(obj) ? obj : []);
        for (const ft of arr) {
          const m = mapFusionTool(ft);
          if (m) mapped.push(m);
          else if (ft?.type) skipped[ft.type] = (skipped[ft.type] || 0) + 1;
        }
      }
      setImportSkipped(Object.entries(skipped));
      if (!mapped.length) {
        setLookupErr("No square/ball/chamfer end mills, drills, or taps found in that file. (In Fusion: Tool Library → right-click a library → Export → .tools file.)");
        return;
      }
      setImportList(mapped.map((t) => ({ tool: t, checked: true })));
    } catch (err) {
      setLookupErr("Couldn't read that file (" + (err.message || "parse error") + "). Export from Fusion as .tools, or rename it .zip, extract, and upload the .json inside.");
    }
  };

  const doImport = () => {
    const add = importList.filter((x) => x.checked).map((x) => x.tool);
    setTools((prev) => {
      const have = new Set(prev.map((t) => (t.brand + "|" + t.pn).toLowerCase()));
      return [...prev, ...add.filter((t) => !t.pn || !have.has((t.brand + "|" + t.pn).toLowerCase()))];
    });
    setImportList(null);
  };

  const runLookup = () => {
    if (!lookupPn.trim()) return;
    setLookupErr("");
    setBatch((b) => ({ total: b.total + 1, done: b.done }));
    setQueue((q) => [...q, { kind: "new", brand: lookupBrand.trim(), pn: lookupPn.trim() }]);
    setLookupBrand(""); setLookupPn("");
  };

  const saveTool = (t) => {
    setTools((prev) => [...prev.filter((x) => x.id !== t.id), t]);
    setCandidates((p) => p.filter((c) => c.tool.id !== t.id));
    setManual(null);
  };
  const dismissCandidate = (id) => setCandidates((p) => p.filter((c) => c.tool.id !== id));

  return (
    <section className="panel">
      <h2>Tool library</h2>
      <p className="hint">Look a tool up once, confirm it, and it's saved with its cutting data. Anything the web search can't find falls back to generic physics tables — clearly labeled.</p>

      <div className="lookup-bar">
        <input className="num txt" placeholder="Brand (Kennametal, Helical…)" value={lookupBrand} onChange={(e) => setLookupBrand(e.target.value)} />
        <input className="num txt" placeholder="Part / order number" value={lookupPn} onChange={(e) => setLookupPn(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runLookup()} />
        <button className="btn primary" disabled={!lookupPn.trim()} onClick={runLookup}>Look up</button>
        <button className="btn" onClick={() => setManual(emptyTool())}>Enter manually</button>
      </div>
      <div className="row-btns" style={{ marginTop: 8 }}>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import Fusion library (.tools / .json)</button>
        <input ref={fileRef} type="file" accept=".tools,.json,.zip" style={{ display: "none" }} onChange={onFusionFile} />
      </div>
      {pendingCount > 0 && (
        <div className="notice info">
          <div className="prog-row">
            <span>Searching the web for <strong>{jobLabel(active)}</strong>{queue.length > 0 ? ` · ${queue.length} more queued` : ""} — safe to switch tabs, this keeps running. Results land below for review.</span>
            <span className="mono dim">{elapsed}{batch.total > 1 ? ` · ${batch.done}/${batch.total}` : ""}</span>
          </div>
          {active && <div className="milestone">{progress || "Contacting the AI…"}</div>}
          {batch.total > 1
            ? <div className="prog"><i style={{ width: (100 * batch.done / batch.total).toFixed(1) + "%" }} /></div>
            : <div className="prog indet"><i /></div>}
        </div>
      )}
      {pendingCount === 0 && batch.total > 1 && batch.done >= batch.total && (
        <div className="notice info">Batch lookup complete — {batch.done} tool{batch.done > 1 ? "s" : ""} processed. Review the results below.</div>
      )}
      {lookupErr && <div className="notice amber">{lookupErr}</div>}

      {importList && (
        <div className="card">
          <h3>Fusion import — {importList.filter((x) => x.checked).length} of {importList.length} selected</h3>
          <p className="hint">Geometry imports instantly; cutting data doesn't come along. Afterward, hit <strong>Look up</strong> on as many tools as you want — they queue and process one at a time, landing below for your review. Or Edit to paste catalog values.</p>
          {importSkipped.length > 0 && <p className="hint dim">Skipped (unsupported for now): {importSkipped.map(([t, n]) => `${n}× ${t}`).join(", ")}</p>}
          <div className="import-list">
            {importList.map((x, i) => (
              <label key={x.tool.id} className="ck">
                <input type="checkbox" checked={x.checked} onChange={() => setImportList((p) => p.map((y, j) => j === i ? { ...y, checked: !y.checked } : y))} />
                <span className="strong">{toolLabel(x.tool, metric)}</span>
                <span className="dim">{TOOL_TYPES[x.tool.type]} · {x.tool.flutes}FL{x.tool.metricTool ? " · metric" : ""}{x.tool.brand ? " · " + x.tool.brand : ""}</span>
              </label>
            ))}
          </div>
          <div className="row-btns">
            <button className="btn primary" onClick={doImport}>Import selected</button>
            <button className="btn" onClick={() => setImportList(null)}>Cancel</button>
          </div>
        </div>
      )}

      {candidates.map((c) => (
        <ToolEditor key={c.tool.id} tool={c.tool} metric={metric}
          heading={`Found: ${toolLabel(c.tool, metric)} — confirm before saving (${c.meta?.confidence || "?"} confidence)`}
          sub={c.meta?.noData ? "Tool identified, but no published cutting data found. Generic tables will be used until you add numbers." : "Cutting data below came from the web — sanity-check it against the catalog."}
          sources={c.meta?.sources} onSave={saveTool} onCancel={() => dismissCandidate(c.tool.id)} />
      ))}
      {manual && (
        <ToolEditor tool={manual} metric={metric} heading="Manual entry" sub="Fill in geometry; add manufacturer cutting data per material group if you have it. Blank groups use generic tables." onSave={saveTool} onCancel={() => setManual(null)} />
      )}

      {tools.length === 0 && candidates.length === 0 && !manual ? (
        <div className="empty">Library's empty. Look up any brand + part number above, import your Fusion tool library, or enter one manually.</div>
      ) : tools.length > 0 && (
        <>
          <div className="filters" style={{ marginTop: 14 }}>
            <select className="num auto" value={tFType} onChange={(e) => setTFType(e.target.value)}>
              <option value="all">All types</option>
              {Object.entries(TOOL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}s</option>)}
            </select>
            {brands.length > 1 && (
              <select className="num auto" value={tFBrand} onChange={(e) => setTFBrand(e.target.value)}>
                <option value="all">All brands</option>
                {brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
            {diaOpts.length > 1 && (
              <select className="num auto" value={tFDia} onChange={(e) => setTFDia(e.target.value)}>
                <option value="all">All Ø</option>
                {diaOpts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
            <select className="num auto" value={tFData} onChange={(e) => setTFData(e.target.value)}>
              <option value="all">Any data</option>
              <option value="mfg">Manufacturer data</option>
              <option value="gen">Generic / physics</option>
            </select>
            <span className="dim">{visible.length} of {tools.length}</span>
          </div>
          {sel.size > 0 && (
            <div className="bulkbar">
              <span className="strong">{sel.size} selected</span>
              <button className="btn sm" onClick={bulkLookup}>Look up all</button>
              <button className="btn sm danger" onClick={bulkDelete}>Delete</button>
              <button className="btn sm" onClick={() => setSel(new Set())}>Clear</button>
            </div>
          )}
          <table className="tbl">
            <thead><tr>
              <th className="ck-col"><input type="checkbox" checked={allVisSelected} onChange={toggleAll} title="Select all visible" /></th>
              <th className="sortable" onClick={() => clickSort("name")}>Tool{arrow("name")}</th>
              <th className="sortable" onClick={() => clickSort("type")}>Type{arrow("type")}</th>
              <th className="sortable" onClick={() => clickSort("dia")}>Ø{arrow("dia")}</th>
              <th className="sortable" onClick={() => clickSort("flutes")}>Fl{arrow("flutes")}</th>
              <th className="sortable wide-col" onClick={() => clickSort("loc")}>LOC{arrow("loc")}</th>
              <th className="sortable wide-col" onClick={() => clickSort("coating")}>Coating{arrow("coating")}</th>
              <th className="sortable" onClick={() => clickSort("data")}>Data{arrow("data")}</th>
              <th />
            </tr></thead>
            <tbody>
              {visible.map((t) => {
                const state = activeId === t.id ? "active" : queuedIds.has(t.id) ? "queued" : "";
                return (
                <tr key={t.id} className={sel.has(t.id) ? "row-sel" : ""}>
                  <td className="ck-col"><input type="checkbox" checked={sel.has(t.id)} onChange={() => toggleSel(t.id)} /></td>
                  <td><span className="strong">{toolLabel(t, metric)}</span><br />
                    <span className="dim mono"><BrandIcon name={t.brand} size={13} />{[t.brand, t.pn].filter(Boolean).join(" ")}{t.name && t.series ? " · " + t.name : ""}</span></td>
                  <td><TypeIcon type={t.type} />{TOOL_TYPES[t.type]}{t.type === "chamfer_mill" && t.angle ? <span className="dim"> {fmt(t.angle, 0)}°</span> : null}{t.metricTool ? <span className="pill gen" style={{ marginLeft: 5 }}>mm</span> : null}</td>
                  <td className="mono">{toolDiaLabel(t, metric)}</td>
                  <td className="mono">{t.flutes}</td>
                  <td className="mono wide-col">{Number.isFinite(t.loc) ? diaLabel(t.loc, metric || !!t.metricTool) : <span className="dim">—</span>}</td>
                  <td className="wide-col">{t.coating || <span className="dim">—</span>}</td>
                  <td>{Object.keys(t.cutting || {}).length
                    ? Object.keys(t.cutting).map((g) => (
                        <span key={g} className="pill grp" style={{ background: groupColor(g) + "1E", color: groupColor(g) }}>
                          <i className="dot" style={{ background: groupColor(g) }} />{g}
                        </span>))
                    : <span className="pill gen">generic</span>}</td>
                  <td className="row-actions">
                    <button className={"btn sm" + (state ? " queued" : "")} disabled={!!state} onClick={() => enqueueEnrich(t)}
                      title={state === "active" ? "Searching the web now…" : state === "queued" ? "Waiting in the lookup queue" : "Search the web for manufacturer cutting data"}>
                      {state === "active" ? "Searching…" : state === "queued" ? "Queued" : "Look up"}
                    </button>
                    <button className="btn sm" onClick={() => setManual({ ...t })}>Edit</button>
                    <button className="btn sm danger" onClick={() => setTools((p) => p.filter((x) => x.id !== t.id))}>Delete</button>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function ToolEditor({ tool, heading, sub, sources, onSave, onCancel, metric }) {
  const [t, setT] = useState(tool);
  useEffect(() => setT(tool), [tool]);
  const set = (k, v) => setT((p) => ({ ...p, [k]: v }));
  const setCut = (grp, k, v) => setT((p) => {
    const cutting = { ...(p.cutting || {}) };
    const row = { ...(cutting[grp] || { src: "user" }) };
    row[k] = v;
    const hasAny = ["sfmLo", "sfmHi", "iptLo", "iptHi"].some((f) => Number.isFinite(row[f]));
    if (hasAny) cutting[grp] = row; else delete cutting[grp];
    return { ...p, cutting };
  });
  const [showGroups, setShowGroups] = useState(Object.keys(tool.cutting || {}).length > 0);

  return (
    <div className="card">
      <h3>{heading}</h3>
      {sub && <p className="hint">{sub}</p>}
      <div className="grid-form">
        <Field label="Brand"><input className="num txt" value={t.brand} onChange={(e) => set("brand", e.target.value)} /></Field>
        <Field label="Part #"><input className="num txt" value={t.pn} onChange={(e) => set("pn", e.target.value)} /></Field>
        <Field label="Series / family"><input className="num txt" placeholder="MaxiMet, FIREX, KenCut AL…" value={t.series || ""} onChange={(e) => set("series", e.target.value)} /></Field>
        <Field label="Description / designation"><input className="num txt" value={t.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Type">
          <select className="num" value={t.type} onChange={(e) => set("type", e.target.value)}>
            {Object.entries(TOOL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label={t.type === "chamfer_mill" ? "Max diameter" : t.type === "tap" ? "Nominal thread Ø" : "Diameter"} unit={metric || t.metricTool ? "mm" : "in"}><NumInput value={t.dia} onChange={(v) => set("dia", v)} metric={metric || !!t.metricTool} isLength /></Field>
        <Field label="Flutes"><input className="num" type="number" min="1" value={t.flutes} onChange={(e) => set("flutes", parseInt(e.target.value) || 1)} disabled={t.type === "drill"} /></Field>
        <Field label="Coating"><input className="num txt" value={t.coating} onChange={(e) => set("coating", e.target.value)} /></Field>
        <Field label="LOC" unit={metric || t.metricTool ? "mm" : "in"}><NumInput value={t.loc ?? NaN} onChange={(v) => set("loc", v)} metric={metric || !!t.metricTool} isLength /></Field>
        {t.type === "tap" && (
          <Field label="Thread pitch (per rev)" unit={metric || t.metricTool ? "mm" : "in"}><NumInput value={t.pitch ?? NaN} onChange={(v) => set("pitch", v)} metric={metric || !!t.metricTool} isLength digits={metric || t.metricTool ? 3 : 5} /></Field>
        )}
        {t.type === "chamfer_mill" && (
          <>
            <Field label="Included angle" unit="deg"><input className="num" type="number" step="any" value={Number.isFinite(t.angle) ? t.angle : ""} placeholder="90" onChange={(e) => set("angle", e.target.value === "" ? null : parseFloat(e.target.value))} /></Field>
            <Field label="Tip Ø (0 if pointed)" unit={metric || t.metricTool ? "mm" : "in"}><NumInput value={t.tipDia ?? NaN} onChange={(v) => set("tipDia", v)} metric={metric || !!t.metricTool} isLength /></Field>
          </>
        )}
      </div>
      <label className="ck">
        <input type="checkbox" checked={!!t.metricTool} onChange={(e) => set("metricTool", e.target.checked)} />
        Metric tool — callouts show in mm (8.5 mm drill, M10×1.5) but feeds &amp; speeds stay in your programming units
      </label>
      {t.notes && <p className="hint">{t.notes}</p>}
      {(sources?.length ? sources : t.sources)?.length > 0 && <p className="hint dim">Sources: {(sources?.length ? sources : t.sources).slice(0, 4).map((s, i) => <a key={i} href={s} target="_blank" rel="noreferrer">[{i + 1}]</a>)}</p>}

      <button className="btn sm" onClick={() => setShowGroups(!showGroups)}>{showGroups ? "Hide" : "Show"} cutting data by material group</button>
      {showGroups && (
        <div className="cut-grid">
          <div className="cut-head"><span>Group</span><span>SFM lo</span><span>SFM hi</span><span>{t.type === "drill" ? "IPR lo" : "IPT lo"}</span><span>{t.type === "drill" ? "IPR hi" : "IPT hi"}</span></div>
          {Object.keys(GROUPS).map((g) => {
            const row = t.cutting?.[g] || {};
            return (
              <div className="cut-row" key={g}>
                <span className="mono dim" title={GROUPS[g].ex}><i className="dot" style={{ background: groupColor(g) }} />{g}</span>
                {["sfmLo", "sfmHi", "iptLo", "iptHi"].map((f) => (
                  <input key={f} className="num sm-in" type="number" step="any" value={Number.isFinite(row[f]) ? row[f] : ""}
                    onChange={(e) => setCut(g, f, e.target.value === "" ? NaN : parseFloat(e.target.value))} />
                ))}
              </div>
            );
          })}
          <p className="hint dim">Feed values always in inches here (per tooth for mills, per rev for drills). Leave a group blank to use generic tables for it.</p>
        </div>
      )}

      <div className="row-btns">
        <button className="btn primary" onClick={() => onSave(t)}>Save to library</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ============================================================
   CALCULATOR TAB
   ============================================================ */
function Calculator({ machines, tools, setTools, metric, goTo }) {
  const [machineId, setMachineId] = useState("");
  const [curveId, setCurveId] = useState(""); // selected spindle/belt config; "" = first continuous curve
  const [toolId, setToolId] = useState("");
  const [group, setGroup] = useState("N1");
  const [mode, setMode] = useState("rough");
  const [op, setOp] = useState("adaptive");
  const [sfm, setSfm] = useState(1200);
  const [ae, setAe] = useState(0.05);
  const [ap, setAp] = useState(0.5);
  const [fz, setFz] = useState(0.005);
  const [targetChip, setTargetChip] = useState(0.004);
  const [ipr, setIpr] = useState(0.006);
  const [seedSrc, setSeedSrc] = useState("generic");
  const [fType, setFType] = useState("all");
  const [fBrand, setFBrand] = useState("all");
  const [fDia, setFDia] = useState("all");
  const [fData, setFData] = useState("all");
  const [presetName, setPresetName] = useState("");
  const skipSeed = useRef(false); // set while applying a preset so the reseed effect doesn't clobber it
  // "quick tool": an unsaved tool spun up from just a type + size (e.g. a drill by number/letter/decimal)
  const [useQuick, setUseQuick] = useState(false);
  const [quick, setQuick] = useState({ type: "drill", size: "", flutes: 2 });

  const machine = machines.find((m) => m.id === machineId) || null;
  const quickParsed = useMemo(() => parseDrillSize(quick.size), [quick.size]);
  const quickTool = useMemo(() => {
    if (!useQuick || !quickParsed) return null;
    return {
      id: "__quick", brand: "", pn: "", series: "", name: `Quick ${TOOL_TYPES[quick.type].toLowerCase()}`,
      type: quick.type, dia: quickParsed.dia, flutes: quick.type === "drill" ? 2 : Math.max(1, quick.flutes || 2),
      coating: "", loc: null, angle: quick.type === "chamfer_mill" ? 90 : null, tipDia: 0, pitch: null,
      metricTool: !!quickParsed.metric, cutting: {}, source: "quick", notes: "", quickLabel: quickParsed.label,
    };
  }, [useQuick, quickParsed, quick.type, quick.flutes]);
  const tool = quickTool || tools.find((t) => t.id === toolId) || null;
  const toolKey = quickTool ? `q:${quick.type}:${quickTool.dia}` : toolId; // drives the seed effects
  const configs = contCurves(machine);
  const effCurveId = configs.some((c) => c.id === curveId) ? curveId : (configs[0]?.id || "");

  // material is the primary filter: tools not rated for the group drop out (no data = assume it cuts everything)
  const brands = useMemo(() => [...new Set(tools.map((t) => t.brand).filter(Boolean))].sort(), [tools]);
  const dias = useMemo(() => [...new Set(tools.map((t) => t.dia).filter(Number.isFinite))].sort((a, b) => a - b), [tools]);
  const filteredTools = useMemo(() => tools.filter((t) =>
    canCut(t, group) &&
    (fType === "all" || t.type === fType) &&
    (fBrand === "all" || t.brand === fBrand) &&
    (fDia === "all" || String(t.dia) === fDia) &&
    (fData === "all" || (fData === "mfg" ? hasMfgData(t) : !hasMfgData(t)))
  ).sort((a, b) => a.dia - b.dia || (a.brand || "").localeCompare(b.brand || "")), [tools, group, fType, fBrand, fDia, fData]);
  // keep a selected tool visible in the dropdown even if the filters no longer match it
  const toolOptions = tool && !quickTool && !filteredTools.some((t) => t.id === tool.id) ? [tool, ...filteredTools] : filteredTools;

  // pick sensible default op per tool type
  useEffect(() => {
    if (!tool) return;
    if (tool.type === "drill") setOp("drill");
    else if (tool.type === "chamfer_mill") setOp("chamfer");
    else if (tool.type === "tap") setOp("tap");
    else if (op === "drill" || op === "chamfer" || op === "tap") setOp("adaptive");
    if (tool.type !== "ball_endmill" && op === "finish3d") setOp("side");
  }, [toolKey]); // eslint-disable-line

  // reseed on tool / material / mode change (skipped while a preset is being applied)
  useEffect(() => {
    if (!tool || skipSeed.current) return;
    const s = seedParams(tool, group, mode, op);
    setSfm(s.sfm); setSeedSrc(s.source);
    if (tool.type === "drill") { if (s.ipt) setIpr(s.ipt); }
    else if (s.ipt) { setFz(s.ipt); setTargetChip(+(s.ipt * (mode === "rough" ? 0.9 : 0.8)).toFixed(5)); }
    // engagement defaults
    if (tool.type === "chamfer_mill") {
      const half = (((tool.angle || 90) / 2) * Math.PI) / 180;
      const maxDepth = ((tool.dia - (tool.tipDia || 0)) / 2) / Math.tan(half);
      setAp(+Math.min(0.04, maxDepth * 0.75).toFixed(4));
    } else if (tool.type !== "drill" && tool.type !== "tap") {
      if (mode === "finish") { setAe(GROUPS[group].stock[0]); setAp(Math.min(tool.loc || tool.dia * 2, tool.dia * 2)); }
      else if (op === "adaptive") { setAe(+(tool.dia * 0.12).toFixed(4)); setAp(Math.min(tool.loc || tool.dia * 1.5, tool.dia * 1.5)); }
      else if (op === "slot") { setAe(tool.dia); setAp(+(tool.dia * 0.5).toFixed(4)); }
      else { setAe(+(tool.dia * 0.25).toFixed(4)); setAp(+(tool.dia * 1).toFixed(4)); }
    }
  }, [toolKey, group, mode, op]); // eslint-disable-line

  const result = useMemo(() => {
    if (!tool) return null;
    const opUse = tool.type === "drill" ? "drill" : tool.type === "chamfer_mill" ? "chamfer" : tool.type === "tap" ? "tap" : op;
    return computeCut({ tool, machine, curveId: effCurveId, group, op: opUse, mode, sfm, ae, ap, targetChip, fz, ipr });
  }, [tool, machine, effCurveId, group, op, mode, sfm, ae, ap, targetChip, fz, ipr]);

  /* ---- presets: a named parameter set saved on the tool ---- */
  const applyPreset = (p) => {
    skipSeed.current = true;
    const q = p.params;
    setMachineId(q.machineId || "");
    setCurveId(q.curveId || "");
    setGroup(q.group); setMode(q.mode); setOp(q.op);
    setSfm(q.sfm); setAe(q.ae); setAp(q.ap); setFz(q.fz); setTargetChip(q.targetChip); setIpr(q.ipr);
    setTimeout(() => { skipSeed.current = false; }, 100);
  };
  const savePreset = () => {
    const name = presetName.trim();
    if (!name || !tool) return;
    const preset = {
      id: "p" + Date.now().toString(36),
      name,
      params: { machineId, curveId: effCurveId, group, mode, op, sfm, ae, ap, fz, targetChip, ipr },
      snap: result ? { rpm: result.rpm, feed: result.feed, hp: result.hp } : null,
    };
    setTools((prev) => prev.map((t) => (t.id === tool.id ? { ...t, presets: [...(t.presets || []).filter((x) => x.name !== name), preset] } : t)));
    setPresetName("");
  };
  const deletePreset = (pid) => setTools((prev) => prev.map((t) => (t.id === tool.id ? { ...t, presets: (t.presets || []).filter((x) => x.id !== pid) } : t)));

  const setRpmDirect = (rpm) => {
    if (!tool || !rpm) return;
    let Deff = tool.dia;
    if (tool.type === "ball_endmill" && op === "finish3d" && ap > 0 && ap < tool.dia / 2) Deff = 2 * Math.sqrt(ap * (tool.dia - ap));
    if (tool.type === "chamfer_mill") {
      const half = (((tool.angle || 90) / 2) * Math.PI) / 180;
      Deff = Math.min(Math.max((tool.tipDia || 0) + 2 * ap * Math.tan(half), tool.tipDia || 0.02), tool.dia);
    }
    setSfm(Math.round((rpm * Math.PI * Deff) / 12));
  };

  const g = GROUPS[group];
  const isDrill = tool?.type === "drill";
  const isChamfer = tool?.type === "chamfer_mill";
  const isTap = tool?.type === "tap";
  const isMill = tool && !isDrill && !isChamfer && !isTap;
  const lenU = metric ? "mm" : "in";
  const feedDisp = (v) => metric ? fmt(v * IN_MM, 0) + " mm/min" : fmt(v, 1) + " in/min";
  const thouDisp = (v, d = 5) => metric ? fmt(v * IN_MM, 3) + " mm" : fmt(v, d) + '"';

  return (
    <section className="calc">
      <div className="panel">
        <div className="sel-row">
          <Field label="Machine">
            <IconSelect value={machineId} onChange={(v) => { setMachineId(v); setCurveId(""); }}
              placeholder="— no machine (no RPM clamp) —"
              options={[
                { value: "", label: "— no machine (no RPM clamp) —", text: "no machine" },
                ...machines.map((m) => ({
                  value: m.id, icon: <BrandIcon name={m.name} />, label: m.name,
                  sub: `${fmt(m.maxRpm, 0)} RPM`, text: m.name,
                })),
              ]} />
          </Field>
          <Field label="Material">
            <IconSelect value={group} onChange={setGroup}
              options={Object.keys(GROUPS).map((k) => ({
                value: k,
                icon: <i className="dot lg" style={{ background: groupColor(k) }} title={"ISO " + k[0]} />,
                label: GROUPS[k].label, sub: GROUPS[k].ex, text: GROUPS[k].label,
              }))} />
          </Field>
        </div>
        {configs.length > 1 && (
          <div className="chip-row" style={{ marginBottom: 12 }}>
            <span className="chip-label">Spindle</span>
            {configs.map((c) => (
              <Chip key={c.id} active={effCurveId === c.id} onClick={() => setCurveId(c.id)}>
                {c.label}{Number.isFinite(c.maxRpm) && c.maxRpm ? ` · ${fmt(c.maxRpm, 0)} RPM` : ""}
              </Chip>
            ))}
          </div>
        )}
        {tools.length > 0 && (
          <div className="filters">
            <span className="chip-label">Tools</span>
            {["all", ...Object.keys(TOOL_TYPES)].map((k) => (
              <Chip key={k} active={fType === k} onClick={() => setFType(k)}>{k === "all" ? "All types" : <><TypeIcon type={k} size={16} />{TOOL_TYPES[k]}</>}</Chip>
            ))}
            {brands.length > 1 && (
              <select className="num auto" value={fBrand} onChange={(e) => setFBrand(e.target.value)}>
                <option value="all">All brands</option>
                {brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
            {dias.length > 1 && (
              <select className="num auto" value={fDia} onChange={(e) => setFDia(e.target.value)}>
                <option value="all">All Ø</option>
                {dias.map((d) => <option key={d} value={String(d)}>{diaLabel(d, metric)}</option>)}
              </select>
            )}
            <select className="num auto" value={fData} onChange={(e) => setFData(e.target.value)}>
              <option value="all">Any data</option>
              <option value="mfg">Manufacturer data</option>
              <option value="gen">Generic / physics</option>
            </select>
          </div>
        )}
        <div className="sel-row">
          <Field label={`Tool — ${filteredTools.length} of ${tools.length} match ${group}` + (fType !== "all" || fBrand !== "all" || fDia !== "all" || fData !== "all" ? " + filters" : "")}>
            <IconSelect value={quickTool ? "" : toolId} onChange={(v) => { setToolId(v); setUseQuick(false); }} placeholder={quickTool ? "— using quick tool below —" : "— select a tool —"}
              options={[
                { value: "", label: "— select a tool —", text: "select a tool" },
                ...toolOptions.map((t) => ({
                  value: t.id,
                  icon: <span className="isel-icons"><BrandIcon name={t.brand} /><TypeIcon type={t.type} size={17} /></span>,
                  label: toolLabel(t, metric),
                  sub: `${t.flutes}FL ${TOOL_TYPES[t.type]}${t.brand ? " · " + t.brand : ""}${hasMfgData(t) ? "" : " · generic"}${!canCut(t, group) ? ` · not rated for ${group}` : ""}`,
                  text: toolLabel(t, metric),
                })),
              ]} />
          </Field>
        </div>
        <div className="quick-tool">
          <button className="linky" onClick={() => { setUseQuick((q) => !q); if (!useQuick) setToolId(""); }}>
            {useQuick ? "× Close quick tool" : "＋ Quick tool by size — drill or end mill, no saving"}
          </button>
          {useQuick && (
            <div className="quick-row">
              <select className="num auto" value={quick.type} onChange={(e) => setQuick((q) => ({ ...q, type: e.target.value }))}>
                <option value="drill">Drill</option>
                <option value="square_endmill">Square end mill</option>
                <option value="ball_endmill">Ball end mill</option>
              </select>
              <input className="num quick-size" placeholder="size: 1/4, .201, #7, F, 8.5mm" value={quick.size}
                onChange={(e) => setQuick((q) => ({ ...q, size: e.target.value }))} autoFocus />
              {quick.type !== "drill" && (
                <input className="num quick-fl" type="number" min="1" value={quick.flutes} title="flutes"
                  onChange={(e) => setQuick((q) => ({ ...q, flutes: parseInt(e.target.value) || 1 }))} />
              )}
              <span className={"quick-resolved" + (quick.size && !quickParsed ? " bad" : "")}>
                {quick.size ? (quickParsed
                  ? `→ ${quickParsed.label} · Ø${diaLabel(quickParsed.dia, metric)}`
                  : "unrecognized — try 1/4, .201, #7, F, or 8.5mm")
                  : "number (#7), letter (F), fraction (1/4), decimal (.201), or metric (8.5mm)"}
              </span>
            </div>
          )}
        </div>
        {tool && !canCut(tool, group) && (
          <div className="notice amber">This tool has manufacturer data but none for {group} — running generic {group} tables. Double-check the geometry/coating actually suits this material (aluminum-specific tools in steel = bad time).</div>
        )}

        {!tool ? (
          <div className="empty">
            Pick a tool to calculate. {tools.length === 0 && <>Nothing in the library yet — <button className="linky" onClick={() => goTo("tools")}>add your first tool</button>.</>}
            {machines.length === 0 && <> No machines saved either — <button className="linky" onClick={() => goTo("machines")}>add one</button> so RPM gets clamped to reality.</>}
          </div>
        ) : (
          <>
            <div className="chip-rows">
              {isMill && (
                <div className="chip-row">
                  <span className="chip-label">Operation</span>
                  <Chip active={op === "adaptive"} onClick={() => setOp("adaptive")}><BrandIcon name="fusion" size={14} />Adaptive / dynamic</Chip>
                  <Chip active={op === "side"} onClick={() => setOp("side")}>Side milling</Chip>
                  <Chip active={op === "slot"} onClick={() => setOp("slot")}>Slotting</Chip>
                  {tool.type === "ball_endmill" && <Chip active={op === "finish3d"} onClick={() => setOp("finish3d")}>3D finishing</Chip>}
                </div>
              )}
              <div className="chip-row">
                {!isChamfer && !isTap && (
                  <>
                    <span className="chip-label">Mode</span>
                    <Chip active={mode === "rough"} onClick={() => setMode("rough")}>Roughing</Chip>
                    <Chip active={mode === "finish"} onClick={() => setMode("finish")}>Finishing</Chip>
                  </>
                )}
                <span className={"pill " + (seedSrc === "manufacturer" ? "mfg" : "gen")}>
                  {seedSrc === "manufacturer" ? "seeded from manufacturer data" : "seeded from generic tables"}
                </span>
                {quickTool && <span className="pill gen">quick tool · Ø{diaLabel(quickTool.dia, metric)}{quickTool.quickLabel ? ` (${quickTool.quickLabel})` : ""}</span>}
              </div>
              {hasMfgData(tool) && tool.sources?.length > 0 && (
                <div className="src-cite">
                  <span className="src-label">Manufacturer data cited from</span>
                  {tool.sources.slice(0, 4).map((s, i) => {
                    let host = s; try { host = new URL(s).hostname.replace(/^www\./, ""); } catch { /* keep raw */ }
                    return <a key={i} className="src-link" href={s} target="_blank" rel="noreferrer" title={s}>{host}</a>;
                  })}
                </div>
              )}
            </div>

            <div className="grid-form">
              <Field label="Cutting speed" unit={metric ? "m/min" : "SFM"}>
                <NumInput value={metric ? sfm * 0.3048 : sfm} onChange={(v) => setSfm(metric ? v / 0.3048 : v)} digits={0} />
              </Field>
              <Field label="Spindle speed" unit="RPM">
                <NumInput value={result?.rpm || 0} onChange={setRpmDirect} digits={0} />
              </Field>
              {isChamfer && (
                <>
                  <Field label="Chamfer depth (axial)" unit={lenU}>
                    <NumInput value={ap} onChange={setAp} metric={metric} isLength />
                  </Field>
                  <Field label="Feed per tooth (fz)" unit={lenU}>
                    <NumInput value={fz} onChange={setFz} metric={metric} isFeedPerTooth digits={metric ? 3 : 5} />
                  </Field>
                </>
              )}
              {isTap && (
                <Field label="Thread pitch (locked)" unit={tool.metricTool ? "mm/rev" : "in/rev"}>
                  <input className="num" disabled value={Number.isFinite(tool.pitch) ? (tool.metricTool ? fmt(tool.pitch * IN_MM, 3) : fmt(tool.pitch, 5)) : "— set in library"} readOnly />
                </Field>
              )}
              {isMill && (
                <>
                  <Field label={op === "adaptive" ? "Optimal load (radial, ae)" : op === "slot" ? "Slot width (= Ø)" : "Stepover (radial, ae)"} unit={lenU}>
                    <NumInput value={op === "slot" ? tool.dia : ae} onChange={setAe} metric={metric} isLength disabled={op === "slot"} />
                  </Field>
                  <Field label="Stepdown (axial, ap)" unit={lenU}>
                    <NumInput value={ap} onChange={setAp} metric={metric} isLength />
                  </Field>
                  {op === "adaptive" ? (
                    <Field label="Target chip thickness" unit={lenU}>
                      <NumInput value={targetChip} onChange={setTargetChip} metric={metric} isFeedPerTooth digits={metric ? 3 : 5} />
                    </Field>
                  ) : (
                    <Field label="Feed per tooth (fz)" unit={lenU}>
                      <NumInput value={fz} onChange={setFz} metric={metric} isFeedPerTooth digits={metric ? 3 : 5} />
                    </Field>
                  )}
                </>
              )}
              {isDrill && (
                <Field label="Feed per rev" unit={metric ? "mm/rev" : "in/rev"}>
                  <NumInput value={ipr} onChange={setIpr} metric={metric} isFeedPerTooth digits={metric ? 3 : 4} />
                </Field>
              )}
            </div>
            {op === "adaptive" && !isDrill && (
              <p className="hint">Adaptive uses <strong>optimal load</strong> (Fusion's term) = constant radial engagement. Feed is chip-thinning compensated to hold your target chip. Conventional side milling uses plain <strong>stepover</strong> + fz because engagement spikes in corners.</p>
            )}
            {quickTool ? (
              <p className="hint dim" style={{ marginTop: 10 }}>Quick tools aren't saved, so presets are off. Add it to your library from the Tools tab to keep it and save presets.</p>
            ) : (
              <div className="preset-bar">
                <span className="chip-label">Presets</span>
                {(tool.presets || []).map((p) => (
                  <span key={p.id} className="preset-chip">
                    <button className="chip" onClick={() => applyPreset(p)}
                      title={p.snap ? `${fmt(p.snap.rpm, 0)} RPM · ${metric ? fmt(p.snap.feed * IN_MM, 0) + " mm/min" : fmt(p.snap.feed, 1) + " ipm"} · ${fmt(p.snap.hp, 2)} HP when saved` : "Load this setup"}>{p.name}</button>
                    <button className="preset-x" onClick={() => deletePreset(p.id)} title="Delete preset">×</button>
                  </span>
                ))}
                {(tool.presets || []).length === 0 && <span className="dim">none yet for this tool — dial in a cut, name it, save it</span>}
                <input className="num txt preset-name" placeholder="Name this setup…" value={presetName}
                  onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePreset()} />
                <button className="btn sm" disabled={!presetName.trim()} onClick={savePreset} title="Save the current machine, material, and cut parameters to this tool">Save preset</button>
              </div>
            )}
          </>
        )}
      </div>

      {tool && result && (
        <div className="dro">
          <div className="dro-main">
            <div className="dro-cell big">
              <span className="dro-label">Spindle</span>
              <span className={"dro-val" + (result.clamped ? " clamp" : "")}>{fmt(result.rpm, 0)}</span>
              <span className="dro-unit">RPM{result.clamped ? " (clamped)" : ""}</span>
            </div>
            <div className="dro-cell big">
              <span className="dro-label">Feed</span>
              <span className="dro-val">{metric ? fmt(result.feed * IN_MM, 0) : fmt(result.feed, 1)}</span>
              <span className="dro-unit">{metric ? "mm/min" : "in/min"}</span>
            </div>
          </div>
          <div className="dro-grid">
            <DroStat label="Actual SFM" v={metric ? fmt(result.sfmActual * 0.3048, 0) + " m/min" : fmt(result.sfmActual, 0)} />
            <DroStat label={isDrill ? "Feed / rev" : isTap ? "Pitch / rev" : "Programmed fz"} v={thouDisp(result.fzProg)} />
            {isMill && <DroStat label="Actual chip" v={op === "adaptive" ? thouDisp(targetChip) : thouDisp(result.chipActual ?? fz)} />}
            <DroStat label="MRR" v={metric ? fmt(result.mrr * 16.387, 1) + " cm³/min" : fmt(result.mrr, 2) + " in³/min"} />
            <DroStat label="Power @ tool" v={fmt(result.hp, 2) + " HP"} />
            <DroStat label="Torque @ tool" v={fmt(result.torque, 2) + " ft-lb"} />
          </div>
          {Number.isFinite(result.hpAvail) && result.hp > 0 && (
            <div className="pbar-wrap">
              <div className="pbar-top">
                <span>Spindle load @ {fmt(result.rpm, 0)} RPM {result.hpSrc === "curve" ? `· ${result.curveLabel || "power"} curve` : "· flat rating (import a curve for real numbers)"}</span>
                <span className="mono">{fmt(result.hp, 2)} / {fmt(result.hpAvail, 1)} HP · {result.hpPct > 9.99 ? ">999" : fmt(result.hpPct * 100, 0)}%{Number.isFinite(result.hpBurst) ? ` · burst ${fmt(result.hpBurst, 1)} HP` : ""}</span>
              </div>
              <div className="pbar">
                <i className={result.hpPct > 1 ? (Number.isFinite(result.hpBurst) && result.hp <= result.hpBurst ? "a" : "r") : result.hpPct > 0.8 ? "a" : "g"} style={{ width: Math.min(result.hpPct * 100, 100) + "%" }} />
              </div>
            </div>
          )}
          {result.warnings.map((w, i) => <div key={i} className={"notice " + (w.level === "red" ? "red" : "amber")}>{w.msg}</div>)}
          {result.info.map((s, i) => <div key={i} className="notice info">{s}</div>)}
          {mode === "finish" && !isDrill && !isChamfer && (
            <div className="notice info">Stock-to-leave for {group}: {thouDisp(g.stock[0], 3)}–{thouDisp(g.stock[1], 3)} radial · roughly half that axial on floors. Add a spring pass on toleranced or thin walls.</div>
          )}
          {seedSrc === "generic" && <div className="notice info">Running on generic {group} tables for this tool — conservative starting points. Add manufacturer data in the library to sharpen them.</div>}
        </div>
      )}
    </section>
  );
}

function DroStat({ label, v }) {
  return (
    <div className="dro-cell">
      <span className="dro-label">{label}</span>
      <span className="dro-val sm">{v}</span>
    </div>
  );
}

/* ============================================================
   STYLES — "machine enamel" light industrial + DRO readout
   ============================================================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Archivo+Expanded:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

:root{
  --bg:#E7E8E4; --panel:#FDFDFC; --ink:#22262B; --label:#6B7280; --line:#D2D5CF;
  --accent:#B96A00; --accent-ink:#8F5200;
  --dro-bg:#171B1E; --dro-line:#2A3237; --dro-green:#4FE38C; --dro-dim:#7C8A85;
  --amber:#A26A00; --amber-bg:#FBF1DC; --red:#B03B36; --red-bg:#F9E7E5; --info-bg:#EDF0EA; --mfg:#1E6E45;
}
*{box-sizing:border-box}
.app{min-height:100vh;background:var(--bg);color:var(--ink);font-family:'Archivo',system-ui,sans-serif;font-size:14px;line-height:1.45;padding:0 0 48px}
.mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
.strong{font-weight:600}.dim{color:var(--label);font-size:12px}

.topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 22px 10px;flex-wrap:wrap}
.topbar-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.brand{display:flex;gap:12px;align-items:center}
.brand-mark{width:14px;height:34px;background:repeating-linear-gradient(45deg,var(--accent),var(--accent) 5px,var(--ink) 5px,var(--ink) 10px);border-radius:2px;flex:none}
.brand h1{font-family:'Archivo Expanded','Archivo',sans-serif;font-size:19px;font-weight:700;letter-spacing:.01em;margin:0;text-transform:uppercase}
.brand p{margin:1px 0 0;color:var(--label);font-size:12px}
.unit-toggle{display:flex;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--panel)}
.unit-toggle button{border:0;background:transparent;padding:6px 14px;font:inherit;font-family:'IBM Plex Mono',monospace;font-size:12px;cursor:pointer;color:var(--label)}
.unit-toggle button.on{background:var(--ink);color:#fff}

.tabs{display:flex;gap:4px;padding:0 22px;border-bottom:1px solid var(--line)}
.tab{border:0;background:transparent;font:inherit;font-weight:500;padding:9px 14px;cursor:pointer;color:var(--label);border-bottom:2px solid transparent;margin-bottom:-1px}
.tab.on{color:var(--ink);border-bottom-color:var(--accent);font-weight:600}
.tab:focus-visible,.btn:focus-visible,.chip:focus-visible,.num:focus-visible{outline:2px solid var(--accent);outline-offset:1px}

main{padding:18px 22px;margin:0 auto}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px 18px 16px;margin-bottom:16px}
.panel h2{margin:0 0 4px;font-size:16px;font-weight:700}
.hint{color:var(--label);font-size:12.5px;margin:4px 0 12px}
.loading,.empty{padding:28px;text-align:center;color:var(--label)}
.empty{background:var(--panel);border:1px dashed var(--line);border-radius:10px;margin-top:12px}
.linky{border:0;background:none;color:var(--accent-ink);font:inherit;text-decoration:underline;cursor:pointer;padding:0}

.grid-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px 12px;margin:8px 0 12px}
.sel-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:12px}
.field{display:flex;flex-direction:column;gap:4px}
.field-label{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--label)}
.field-label em{font-style:normal;color:var(--accent-ink);margin-left:5px;text-transform:none}
.num{font-family:'IBM Plex Mono',monospace;font-size:14px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--ink);width:100%}
.num:disabled{background:var(--bg);color:var(--label)}
select.num{font-family:'Archivo',sans-serif}
.txt{font-family:'Archivo',sans-serif}

.row-btns{display:flex;gap:8px;margin-top:6px;flex-wrap:wrap}
.btn{border:1px solid var(--line);background:var(--panel);color:var(--ink);font:inherit;font-weight:600;font-size:13px;padding:8px 14px;border-radius:6px;cursor:pointer}
.btn:hover{border-color:var(--ink)}
.btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.btn.primary:hover{background:#000}
.btn.primary:disabled{opacity:.55;cursor:default}
.btn.sm{padding:4px 9px;font-size:12px}
.btn.danger{color:var(--red)}
/* keep td a real table-cell (display:flex here broke row border alignment) */
.row-actions{text-align:right;white-space:nowrap}
.row-actions .btn{margin-left:6px}

.tbl{width:100%;border-collapse:collapse;margin-top:12px}
.tbl th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--label);padding:6px 8px;border-bottom:1px solid var(--line)}
.tbl td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.pill{display:inline-block;font-family:'IBM Plex Mono',monospace;font-size:11px;padding:2px 8px;border-radius:99px}
.pill.mfg{background:#E2F1E8;color:var(--mfg)}
.pill.gen{background:var(--info-bg);color:var(--label)}
.pill.grp{margin-right:4px;font-weight:600}
.dot{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:baseline}
.dot.lg{width:15px;height:15px;border-radius:4px;flex:none;margin:0}

/* IconSelect — dropdown that can carry brand favicons / ISO color squares,
   which a native <select> can't render inside its <option>s */
.isel{position:relative}
.isel-btn{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer;font-family:'Archivo',sans-serif}
.isel-btn:disabled{cursor:default}
.isel-cur{display:flex;align-items:center;gap:0;min-width:0;flex:1}
.isel-cur .bicon,.isel-cur .ticon,.isel-cur .dot{flex:none}
.isel-txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.isel-cur .dot.lg{margin-right:8px}
.isel-sub{margin-left:7px;white-space:nowrap}
.isel-caret{color:var(--label);font-size:11px;flex:none}
.isel.open .isel-btn{border-color:var(--accent)}
.isel-list{position:absolute;z-index:40;top:calc(100% + 4px);left:0;right:0;max-height:340px;overflow-y:auto;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.13);padding:4px}
.isel-opt{display:flex;align-items:center;gap:0;width:100%;text-align:left;border:0;background:transparent;font:inherit;color:var(--ink);padding:7px 9px;border-radius:6px;cursor:pointer;font-size:13.5px}
.isel-opt .dot.lg{margin-right:9px}
.isel-opt.hi{background:var(--info-bg)}
.isel-opt.sel{font-weight:600}
.isel-opt-txt{display:flex;flex-direction:column;gap:1px;min-width:0}
.isel-opt-txt>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.isel-icons{display:inline-flex;align-items:center;flex:none}
.isel-icons .ticon{margin-right:7px}
.ck{display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--label);margin:0 0 12px;flex-wrap:wrap;cursor:pointer}
.ck input{accent-color:var(--accent)}
.iso-legend{display:inline-flex;gap:10px;margin-left:10px;font-family:'IBM Plex Mono',monospace;font-size:11px}
.filters{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:2px 0 12px}
.num.auto{width:auto;padding:5px 8px;font-size:12.5px;border-radius:99px}
.btn.queued{opacity:.55;cursor:default}
.prog-row{display:flex;justify-content:space-between;gap:12px;align-items:center}
.prog{height:6px;background:#D8DCD4;border-radius:99px;overflow:hidden;margin-top:7px}
.prog i{display:block;height:100%;background:var(--accent);border-radius:99px;transition:width .4s ease}
.prog.indet i{width:38%;animation:prog-slide 1.6s ease-in-out infinite}
@keyframes prog-slide{0%{margin-left:-38%}100%{margin-left:100%}}
.milestone{font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--accent-ink);margin-top:6px}
.bulkbar{display:flex;gap:8px;align-items:center;background:var(--info-bg);border:1px solid var(--line);border-radius:8px;padding:7px 12px;margin-bottom:8px}
th.sortable{cursor:pointer;user-select:none;white-space:nowrap}
th.sortable:hover{color:var(--ink)}
.ck-col{width:28px}
tr.row-sel td{background:#FBF4E6}
.spark{display:block}
.spark-line{stroke:var(--accent);stroke-width:1.6}
.spark-fill{fill:var(--accent);opacity:.12}
.dro .spark-line{stroke:var(--dro-green)}
.curve-cell{display:flex;flex-direction:column;gap:6px}
.curve-mini{display:flex;align-items:center;gap:8px}
.pbar-wrap{margin-top:12px;border:1px solid var(--dro-line);border-radius:8px;padding:10px 12px}
.pbar-top{display:flex;justify-content:space-between;gap:12px;font-size:11px;color:var(--dro-dim);font-family:'IBM Plex Mono',monospace;margin-bottom:7px;flex-wrap:wrap}
.pbar{height:10px;background:#22292E;border-radius:99px;overflow:hidden}
.pbar i{display:block;height:100%;border-radius:99px;transition:width .3s ease}
.pbar i.g{background:var(--dro-green);box-shadow:0 0 10px rgba(79,227,140,.4)}
.pbar i.a{background:#F5C445;box-shadow:0 0 10px rgba(245,196,69,.4)}
.pbar i.r{background:#EE6A5F;box-shadow:0 0 10px rgba(238,106,95,.5)}
.import-list{display:flex;flex-direction:column;gap:4px;max-height:260px;overflow:auto;margin:8px 0;padding:8px;border:1px solid var(--line);border-radius:8px;background:#fff}
.import-list .ck{margin:0}

.lookup-bar{display:grid;grid-template-columns:1fr 1.2fr auto auto;gap:8px;align-items:center}
@media(max-width:720px){.lookup-bar{grid-template-columns:1fr 1fr}.dro-main{grid-template-columns:1fr}}
.card{border:1px solid var(--accent);border-radius:10px;padding:14px;margin:14px 0;background:#FFFDF8}
.card h3{margin:0 0 2px;font-size:14px}
.cut-grid{margin:10px 0}
.cut-head,.cut-row{display:grid;grid-template-columns:52px repeat(4,1fr);gap:6px;align-items:center;margin-bottom:4px}
.cut-head span{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--label)}
.sm-in{padding:5px 7px;font-size:12.5px}

.chip-rows{display:flex;flex-direction:column;gap:8px;margin:4px 0 12px}
.chip-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.chip-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--label);margin-right:4px;min-width:70px}
.chip{border:1px solid var(--line);background:#fff;font:inherit;font-size:12.5px;font-weight:500;padding:5px 12px;border-radius:99px;cursor:pointer;color:var(--ink)}
.chip-on{background:var(--ink);border-color:var(--ink);color:#fff}

.dro{background:var(--dro-bg);border-radius:12px;padding:18px;border:1px solid #000;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
.dro-main{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.dro-cell{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border:1px solid var(--dro-line);border-radius:8px}
.dro-cell.big .dro-val{font-size:38px}
.dro-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--dro-dim);font-family:'IBM Plex Mono',monospace}
.dro-val{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:16px;color:var(--dro-green);text-shadow:0 0 12px rgba(79,227,140,.35)}
.dro-val.sm{font-size:16px}
.dro-val.clamp{color:#F5C445;text-shadow:0 0 12px rgba(245,196,69,.35)}
.dro-unit{font-size:11px;color:var(--dro-dim);font-family:'IBM Plex Mono',monospace}
.dro-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:10px}

.notice{border-radius:8px;padding:9px 12px;font-size:12.5px;margin-top:8px}
.notice.amber{background:var(--amber-bg);color:var(--amber);border:1px solid #E3C589}
.notice.red{background:var(--red-bg);color:var(--red);border:1px solid #E0A49F}
.notice.info{background:var(--info-bg);color:#4B5563;border:1px solid var(--line)}
.dro .notice.info{background:#20262A;color:#9AA8A2;border-color:var(--dro-line)}
.dro .notice.amber{background:#2A2415;border-color:#5C4A1E;color:#E8C36B}
.dro .notice.red{background:#2C1A18;border-color:#6B322E;color:#EE8A82}

/* icons: brand favicons + tool-type glyphs */
.bicon{border-radius:3px;vertical-align:-3px;margin-right:6px}
.ticon{vertical-align:-4px;margin-right:6px;color:var(--ink);opacity:.75}
.chip .ticon{color:inherit;opacity:1;margin-right:5px;vertical-align:-3px}
.chip-on .ticon{color:#fff}
.chip .bicon{vertical-align:-2px;margin-right:5px}

/* machine curve manager */
.curve-list{display:flex;flex-direction:column;gap:6px;margin:2px 0 12px;padding:8px;border:1px solid var(--line);border-radius:8px;background:#fff}
.curve-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.curve-row.ai{align-items:flex-start;border:1px solid var(--line);border-radius:8px;padding:8px;margin-bottom:6px;background:#fff}
.curve-row.ai input[type=checkbox]{margin-top:16px;accent-color:var(--accent)}
.curve-label{width:180px;flex:none}
.curve-meta{display:flex;flex-direction:column;gap:4px;flex:1;min-width:220px}
.curve-meta-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}

/* calculation presets saved on a tool */
/* quick tool by size */
.quick-tool{margin:-4px 0 12px}
.quick-tool .linky{font-size:12.5px}
.quick-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;padding:10px;border:1px solid var(--line);border-radius:8px;background:#fff}
.quick-size{width:180px;flex:none}
.quick-fl{width:64px;flex:none}
.quick-resolved{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--mfg)}
.quick-resolved.bad{color:var(--red)}

/* manufacturer-data source citation in the calculator */
.src-cite{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}
.src-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--label)}
.src-link{font-size:12px;font-family:'IBM Plex Mono',monospace;color:var(--accent-ink);background:var(--info-bg);border:1px solid var(--line);border-radius:99px;padding:2px 9px;text-decoration:none;white-space:nowrap}
.src-link:hover{border-color:var(--accent);text-decoration:underline}

.preset-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;border-top:1px dashed var(--line);padding-top:10px;margin-top:4px}
.preset-chip{display:inline-flex;align-items:center}
.preset-chip .chip{border-radius:99px 0 0 99px;border-right:0}
.preset-x{border:1px solid var(--line);border-radius:0 99px 99px 0;background:#fff;color:var(--label);font:inherit;font-size:12px;padding:5px 8px 5px 5px;cursor:pointer;line-height:1.2}
.preset-x:hover{color:var(--red);border-color:var(--red)}
.preset-name{width:170px;flex:none;padding:5px 10px;font-size:12.5px;border-radius:99px}

/* full-width layout: calculator goes two-column with a sticky DRO on wide screens */
@media(min-width:1180px){
  .calc{display:grid;grid-template-columns:minmax(540px,1.15fr) minmax(430px,1fr);gap:16px;align-items:start}
  .calc>.panel{margin-bottom:0}
  .calc .dro{position:sticky;top:14px}
}
@media(max-width:900px){.wide-col{display:none}}

@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
`;
