import React, { useEffect, useMemo, useRef, useState } from "react";

function normalizeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return "https://" + u.replace(/^\/+/, "");
}

// Opens an external link in a new tab/window as reliably as possible.
// NOTE: For best popup-blocker behavior, call this directly inside a click handler.
function openExternal(rawUrl) {
  const u = normalizeUrl(rawUrl);
  if (!u) return;

  // 1) Try window.open first (often the most "user-gesture" friendly).
  try {
    const w = window.open(u, "_blank", "noopener,noreferrer");
    if (w) {
      try {
        w.opener = null;
      } catch {}
      return;
    }
  } catch {}

  // 2) Fallback: synthetic anchor click
  try {
    const a = document.createElement("a");
    a.href = u;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.referrerPolicy = "no-referrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  } catch {}

  // 3) Last resort: same-tab navigation
  window.location.href = u;
}

function pretty(num) {
  if (num === undefined || num === null || Number.isNaN(num)) return "—";
  return Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(num);
}

function usePersistedState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);

  return [state, setState];
}

const KW_PRESETS = [
  { key: "creality_hi", label: "Creality Hi PLA — 0.129 kW", kw: 0.129 },
  { key: "creality_k2pro", label: "Creality K2 Pro PLA — 0.183 kW", kw: 0.183 },
  { key: "bambu_a1mini", label: "Bambu Lab A1 Mini PLA — ~0.77 kW", kw: 0.77 },
  { key: "bambu_a1", label: "Bambu Lab A1 PLA — ~0.93 kW", kw: 0.93 },
  { key: "bambu_p1s", label: "Bambu Lab P1S PLA — 0.10 kW", kw: 0.1 },
  { key: "bambu_h2s", label: "Bambu Lab H2S PLA — 0.175 kW", kw: 0.175 },
  { key: "bambu_h2c", label: "Bambu Lab H2C PLA — 0.128 kW", kw: 0.128 },
  { key: "other", label: "Other (Custom kW)", kw: null },
];

const HELP_KW_HINT =
  "Pumili ng printer model sa listahan. Lahat ng nasa listahan ay based sa readings ng aking monitoring device at approximate lang. Kung wala ang printer mo sa list, piliin ang Other at maglagay ng sarili mong kW value.";

const STORAGE_KEY = "ds3dpc_v1_5";
const WIPE_ONCE_KEY = "ds3dpc_v1_5_wiped_once";

const INITIAL_STATE = {
  label: "Dr Shiela 3D Prints 3D Printing Calculator",

  pricingMode: "derive",
  spoolPrice: 800,
  spoolWeight: 1000,
  fixedPerGram: 2.0,

  partWeight: "",

  printTimeHours: 6,
  printTimeMinutes: 0,
  printTimeSeconds: 0,

  electricityMode: "wattage",

  wattage: 120,

  kwPreset: "creality_hi",
  kwCustom: "",

  kwhPrice: 12,

  electricityPhpPerHour: 5,

  laborCost: 0,

  packaging: 0,
  paint: 0,
  adhesives: 0,
  shipping: 0,
  modelingFee: 0,

  failureMarginPct: 10,
  markupPct: 20,

  facebookUrl: "https://www.facebook.com/drshiela3dprintspage",
  youtubeUrl: "https://www.youtube.com/@DrShiela3DPrints",
  tiktokUrl: "https://www.tiktok.com/@drshiela3dprints",
  instagramUrl: "https://www.instagram.com/drshiela3dprints",
  tapoUrl: "https://s.shopee.ph/AABsL1KL7t",

  saves: [],
  productName: "",
};

async function fetchCountApiValue(url, timeoutMs = 4000) {
  if (typeof fetch !== "function") return null;

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller ? controller.signal : undefined,
    });

    if (!res || !res.ok) return null;

    const text = await res.text();
    if (!text) return null;

    try {
      const data = JSON.parse(text);
      return typeof data.value === "number" ? data.value : null;
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

function ExternalLink({ href, className, title, children }) {
  const safeHref = normalizeUrl(href);
  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        // Force the open to happen from the direct user click.
        e.preventDefault();
        openExternal(href);
      }}
      className={className}
      title={title}
    >
      {children}
    </a>
  );
}

export default function App() {
  const [s, setS] = usePersistedState(STORAGE_KEY, INITIAL_STATE);

  // v1.5 hard reset (wipe old saved state) — runs once per browser/device.
  useEffect(() => {
    try {
      const already = localStorage.getItem(WIPE_ONCE_KEY);
      if (already === "1") return;

      // Wipe both old and new keys so social links + fields reset to v1.5 defaults.
      localStorage.removeItem("ds3dpc_v1_4");
      localStorage.removeItem("ds3dpc_v1_5");
      localStorage.setItem(WIPE_ONCE_KEY, "1");

      // Force React state to v1.5 defaults.
      setS(INITIAL_STATE);
    } catch {
      // If storage is blocked, we just continue.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [useCount, setUseCount] = useState(null);
  const counterWarnedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const value = await fetchCountApiValue(
        "https://api.countapi.xyz/hit/drshiela3dprints/ds3dpc-v1-5",
        4000
      );
      if (!mounted) return;

      if (typeof value === "number") {
        setUseCount(value);
      } else {
        if (!counterWarnedRef.current) {
          counterWarnedRef.current = true;
          console.warn("CountAPI unavailable (ignored). The calculator will continue to work.");
        }
        setUseCount(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const PHP = "₱";

  const pricePerGram = useMemo(() => {
    if (s.pricingMode === "fixed") return Number(s.fixedPerGram) || 0;
    const p = Number(s.spoolPrice);
    const w = Number(s.spoolWeight);
    return w > 0 ? p / w : 0;
  }, [s.pricingMode, s.fixedPerGram, s.spoolPrice, s.spoolWeight]);

  const weight_g = Number(s.partWeight) > 0 ? Number(s.partWeight) : 0;
  const materialCost = weight_g * pricePerGram;

  const h = Number(s.printTimeHours) || 0;
  const m = Number(s.printTimeMinutes) || 0;
  const sec = Number(s.printTimeSeconds) || 0;
  const printTimeHoursTotal = h + m / 60 + sec / 3600;

  const kwPresetObj = KW_PRESETS.find((p) => p.key === String(s.kwPreset)) || KW_PRESETS[0];
  const avgKw =
    kwPresetObj.key === "other" ? Number(s.kwCustom) || 0 : Number(kwPresetObj.kw) || 0;

  const modeElec = s.electricityMode || "wattage";
  let electricityCost = 0;
  if (modeElec === "kw") {
    electricityCost = avgKw * printTimeHoursTotal * (Number(s.kwhPrice) || 0);
  } else if (modeElec === "php_per_hour") {
    electricityCost = (Number(s.electricityPhpPerHour) || 0) * printTimeHoursTotal;
  } else {
    const watt = Number(s.wattage) || 0;
    electricityCost = (watt * printTimeHoursTotal / 1000) * (Number(s.kwhPrice) || 0);
  }

  const packagingCost = Number(s.packaging) || 0;
  const paintCost = Number(s.paint) || 0;
  const adhesivesCost = Number(s.adhesives) || 0;
  const shippingCost = Number(s.shipping) || 0;
  const modelingFeeCost = Number(s.modelingFee) || 0;
  const laborCostNum = Number(s.laborCost) || 0;

  const productionCost =
    materialCost + electricityCost + laborCostNum + packagingCost + paintCost + adhesivesCost;

  const nonProductionCost = modelingFeeCost + shippingCost;
  const baseSubtotal = productionCost + nonProductionCost;

  const failureMarginRate = Number(s.failureMarginPct) || 0;
  const failureMarginAmount = productionCost * (failureMarginRate / 100);

  const markupRate = Number(s.markupPct) || 0;
  const markupAmount = baseSubtotal * (markupRate / 100);

  const finalPrice = baseSubtotal + failureMarginAmount + markupAmount;

  const resetEverything = () => {
    const ok = confirm(
      "Reset EVERYTHING (all fields + saves)?\n\nIre-reset lahat (fields + saves). Tuloy?"
    );
    if (!ok) return;
    try {
      // Clear both old and new storage keys to truly reset
      localStorage.removeItem("ds3dpc_v1_4");
      localStorage.removeItem("ds3dpc_v1_5");
    } catch {}
    setS(INITIAL_STATE);
  };

  const setMode = (mode) => setS({ ...s, pricingMode: mode });
  const setElecMode = (mode) => setS({ ...s, electricityMode: mode });

  const csvHeaders = [
    "Name",
    "Saved At",
    "Pricing Mode",
    "Spool Price",
    "Spool Weight (g)",
    "Fixed Price/g",
    "Filament Consumed (g)",
    "Print Time (hrs)",
    "Electricity Mode",
    "Wattage (W)",
    "Average Power (kW)",
    "kWh Price",
    "Electricity ₱/hr",
    "Labor Cost",
    "Packaging",
    "Paint",
    "Adhesives",
    "Shipping",
    "3D Modeling Fee",
    "Failure Margin %",
    "Markup %",
    "Price/gram",
    "Material Cost",
    "Electricity Cost",
    "Other Costs (pkg+paint+adh+ship+3D)",
    "Production Cost",
    "Non-Production Cost",
    "Subtotal",
    "With Failure (Subtotal + Failure)",
    "Final Price",
  ];

  const csvEscape = (val) => {
    const str = String(val ?? "");
    return '"' + str.replace(/"/g, '""') + '"';
  };

  const toCsvRow = (entry) => {
    const d = entry.data;

    const ppg =
      d.pricingMode === "fixed"
        ? Number(d.fixedPerGram) || 0
        : (Number(d.spoolPrice) || 0) / ((Number(d.spoolWeight) || 0) || 1);

    const weight = Number(d.partWeight) || 0;
    const mat = weight * ppg;

    const hh = Number(d.printTimeHours) || 0;
    const mm = Number(d.printTimeMinutes) || 0;
    const ss = Number(d.printTimeSeconds) || 0;
    const printHrs = hh + mm / 60 + ss / 3600;

    const elecMode = d.electricityMode || "wattage";

    const presetKey = String(d.kwPreset ?? "");
    const presetObj = KW_PRESETS.find((p) => p.key === presetKey) || KW_PRESETS[0];
    const avgKwCsv =
      presetObj.key === "other" ? Number(d.kwCustom) || 0 : Number(presetObj.kw) || 0;

    let elec = 0;
    let wattForCsv = "";
    let phpPerHourCsv = "";

    if (elecMode === "kw") {
      elec = avgKwCsv * printHrs * (Number(d.kwhPrice) || 0);
    } else if (elecMode === "php_per_hour") {
      phpPerHourCsv = Number(d.electricityPhpPerHour) || 0;
      elec = (Number(d.electricityPhpPerHour) || 0) * printHrs;
    } else {
      const watt = Number(d.wattage) || 0;
      wattForCsv = watt;
      elec = (watt * printHrs / 1000) * (Number(d.kwhPrice) || 0);
    }

    const pkg = Number(d.packaging) || 0;
    const paint = Number(d.paint) || 0;
    const adh = Number(d.adhesives) || 0;
    const ship = Number(d.shipping) || 0;
    const model = Number(d.modelingFee) || 0;
    const labor = Number(d.laborCost) || 0;

    const production = mat + elec + labor + pkg + paint + adh;
    const nonProduction = model + ship;
    const sub = production + nonProduction;

    const fmRate = Number(d.failureMarginPct) || 0;
    const fmAmt = production * (fmRate / 100);

    const muRate = Number(d.markupPct) || 0;
    const muAmt = sub * (muRate / 100);

    const withFail = sub + fmAmt;
    const fin = sub + fmAmt + muAmt;

    const others = pkg + paint + adh + ship + model;

    const cells = [
      entry.name,
      new Date(entry.ts).toLocaleString(),
      d.pricingMode,
      Number(d.spoolPrice) || 0,
      Number(d.spoolWeight) || 0,
      Number(d.fixedPerGram) || 0,
      Number(d.partWeight) || 0,
      printHrs,
      elecMode,
      wattForCsv === "" ? "" : wattForCsv,
      avgKwCsv,
      Number(d.kwhPrice) || 0,
      phpPerHourCsv === "" ? "" : phpPerHourCsv,
      Number(d.laborCost) || 0,
      pkg,
      paint,
      adh,
      ship,
      model,
      Number(d.failureMarginPct) || 0,
      Number(d.markupPct) || 0,
      ppg,
      mat,
      elec,
      others,
      production,
      nonProduction,
      sub,
      withFail,
      fin,
    ];

    return cells.map((v) => (typeof v === "string" ? csvEscape(v) : v)).join(",");
  };

  const BOM = String.fromCharCode(0xfeff);

  const downloadCSV = (rows, filename) => {
    const content = BOM + csvHeaders.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const doSave = () => {
    let name = (s.productName || "").trim();
    if (!name) {
      const typed = prompt("Enter product name to save (Ilagay ang pangalan ng produkto):");
      if (!typed) return;
      name = String(typed).trim();
    }

    const { saves, productName, ...data } = s;
    const snapshot = { name, ts: Date.now(), data };

    let newSaves = Array.isArray(s.saves) ? [...s.saves] : [];
    if (newSaves.length >= 3) {
      const ok = confirm(
        "You already have 3 saves. Override the 1st save (\"" +
          newSaves[0].name +
          "\") and push others down?\n\n" +
          "May 3 saves ka na. I-override ang unang save (\"" +
          newSaves[0].name +
          "\") at itulak pababa ang iba?"
      );
      if (!ok) return;
      newSaves = [snapshot, ...newSaves].slice(0, 3);
    } else {
      newSaves = [snapshot, ...newSaves];
    }

    setS({ ...s, saves: newSaves, productName: name });
    alert("Saved: " + name);
  };

  const loadSave = (idx) => {
    const entry = s.saves[idx];
    if (!entry) return;
    setS({ ...entry.data, saves: s.saves, productName: entry.name });
  };

  const deleteSave = (idx) => {
    const entry = s.saves[idx];
    if (!entry) return;
    const ok = confirm("Delete save \"" + entry.name + "\"? (Burahin ang save na ito?)");
    if (!ok) return;
    setS({ ...s, saves: s.saves.filter((_, i) => i !== idx) });
  };

  const downloadOneSave = (idx) => {
    const entry = s.saves[idx];
    if (!entry) return;
    downloadCSV([toCsvRow(entry)], entry.name || "save");
  };

  const downloadAllSaves = () => {
    if (!s.saves || s.saves.length === 0) {
      alert("No saves to download.");
      return;
    }
    downloadCSV(s.saves.map(toCsvRow), "DS3DPC_Saves_" + new Date().toISOString().slice(0, 10));
  };

  const fmtDate = (ts) => new Date(ts).toLocaleString();

  const selfTest = () => {
    try {
      const entryWatt = {
        name: "Test Item",
        ts: Date.now(),
        data: {
          ...INITIAL_STATE,
          pricingMode: "fixed",
          fixedPerGram: 2,
          partWeight: 12.5,
          printTimeHours: 3.5,
          printTimeMinutes: 0,
          printTimeSeconds: 0,
          electricityMode: "wattage",
          wattage: 120,
          kwhPrice: 12,
          laborCost: 50,
          packaging: 10,
          failureMarginPct: 10,
          markupPct: 20,
        },
      };

      const row = toCsvRow(entryWatt);
      if (!row || typeof row !== "string" || row.indexOf("\n") !== -1) throw new Error("Row format invalid");

      const quoted = toCsvRow({ ...entryWatt, name: 'He said "hello"' });
      if (!quoted.startsWith('"He said ""hello"""')) throw new Error("CSV quote escaping failed");

      const expectedElecWatt = (120 * 3.5 / 1000) * 12;
      const cellsWatt = quoted.split(",");
      const idxElec = csvHeaders.indexOf("Electricity Cost");
      const elecValWatt = parseFloat(cellsWatt[idxElec]);
      if (Math.abs(elecValWatt - expectedElecWatt) > 0.02) throw new Error("Electricity (wattage) calc check failed");

      const entryKw = {
        name: "KW Mode",
        ts: Date.now(),
        data: {
          ...INITIAL_STATE,
          pricingMode: "fixed",
          fixedPerGram: 2,
          partWeight: 10,
          printTimeHours: 2,
          printTimeMinutes: 30,
          printTimeSeconds: 0,
          electricityMode: "kw",
          kwPreset: "other",
          kwCustom: 0.129,
          kwhPrice: 12,
        },
      };

      const rowKw = toCsvRow(entryKw);
      const cellsKw = rowKw.split(",");
      const elecValKw = parseFloat(cellsKw[idxElec]);
      const printHrsKw = 2 + 30 / 60;
      const expectedElecKw = 0.129 * printHrsKw * 12;
      if (Math.abs(elecValKw - expectedElecKw) > 0.02) throw new Error("Electricity (kW) calc check failed");

      const entryPhpHr = {
        name: "PHP/hr Mode",
        ts: Date.now(),
        data: {
          ...INITIAL_STATE,
          pricingMode: "fixed",
          fixedPerGram: 2,
          partWeight: 10,
          printTimeHours: 1,
          printTimeMinutes: 0,
          printTimeSeconds: 0,
          electricityMode: "php_per_hour",
          electricityPhpPerHour: 7.5,
        },
      };

      const rowPhpHr = toCsvRow(entryPhpHr);
      const cellsPhpHr = rowPhpHr.split(",");
      const elecValPhpHr = parseFloat(cellsPhpHr[idxElec]);
      const expectedElecPhpHr = 7.5;
      if (Math.abs(elecValPhpHr - expectedElecPhpHr) > 0.02) throw new Error("Electricity (₱/hr) calc check failed");

      const content = BOM + csvHeaders.join(",") + "\n" + [row, quoted, rowKw, rowPhpHr].join("\n");
      if (content.charCodeAt(0) !== 0xfeff) throw new Error("Missing BOM");

      alert("Self-test passed: CSV + electricity modes OK.");
    } catch (e) {
      alert("Self-test FAILED: " + (e && e.message ? e.message : String(e)));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dr Shiela 3D Prints 3D Printing Calculator 🇵🇭</h1>
            <p className="text-sm text-gray-600">
              Version 1.5 · PHP-only · Persists on refresh · Hover labels for English/Tagalog help.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm">Product:</label>
              <input
                className="rounded-xl border p-2 text-sm"
                placeholder="Enter product name (Pangalan ng produkto)"
                value={s.productName}
                onChange={(e) => setS({ ...s, productName: e.target.value })}
                title="Used as the file name for saves (Gagamitin bilang pangalan ng file sa save)"
              />
            </div>

            <button onClick={doSave} className="rounded-2xl border bg-gray-900 px-3 py-2 text-sm text-white shadow-sm">Save</button>
            <button onClick={downloadAllSaves} className="rounded-2xl border px-3 py-2 text-sm shadow-sm">Download All (.csv)</button>
            <button onClick={() => setMode(s.pricingMode === "derive" ? "fixed" : "derive")} className="rounded-2xl border px-3 py-2 text-sm shadow-sm">Toggle Mode</button>
            <button onClick={selfTest} className="rounded-2xl border px-3 py-2 text-sm shadow-sm" title="Runs a couple of sanity checks on CSV">Run self-test</button>
            <button onClick={resetEverything} className="rounded-2xl border px-3 py-2 text-sm shadow-sm text-red-700" title="Clears all fields + saves">Reset Everything</button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <section className="col-span-1 space-y-3 rounded-2xl bg-white p-4 shadow">
            <h2 className="mb-1 rounded bg-green-600 px-3 py-1 text-lg font-bold text-white">Material Cost</h2>
            <h3 className="-mt-1 text-sm text-gray-600">Price per Gram (2 Ways. Choose 1)</h3>

            <div className="mt-2 flex items-center gap-2" title="Use spool price and weight to compute PHP/g (Gamitin ang presyo at bigat ng spool para sa PHP/g)">
              <input type="checkbox" checked={s.pricingMode === "derive"} onChange={() => setMode("derive")} />
              <label className="font-medium">Derive from spool</label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={`Spool price (${PHP})`} hint="Total cost of one filament spool (Kung magkano mo nabili ang 1 spool ng filament).">
                <Num value={s.spoolPrice} onChange={(v) => setS({ ...s, spoolPrice: v })} />
              </Field>
              <Field label="Spool weight (g)" hint="Weight of the entire spool, usually 1000 g (Bigat ng buong spool, usually 1000 g (1kg)).">
                <Num value={s.spoolWeight} onChange={(v) => setS({ ...s, spoolWeight: v })} />
              </Field>
            </div>

            <div className="my-2 text-center text-xs text-gray-400">— or —</div>

            <div className="flex items-center gap-2" title="Use your own PHP/g (Gamitin ang sarili mong PHP/g)">
              <input type="checkbox" checked={s.pricingMode === "fixed"} onChange={() => setMode("fixed")} />
              <label className="font-medium">Fixed price/gram ({PHP}/g)</label>
            </div>

            <Field label={`Set price (${PHP}/g)`} hint="Your set selling rate per gram (Kung ano yung rate mo per gram).">
              <Num value={s.fixedPerGram} onChange={(v) => setS({ ...s, fixedPerGram: v })} />
            </Field>

            <h3 className="mt-4 rounded bg-green-600 px-3 py-1 text-lg font-bold text-white">Usage</h3>
            <Field label="Filament consumed (g)" hint="From your slicer’s estimate (Mula sa estimate ng slicer. Makikita mo sa preview after mag-slice).">
              <Num value={s.partWeight} onChange={(v) => setS({ ...s, partWeight: v })} />
            </Field>

            <div className="mt-4 rounded bg-yellow-50 p-3 text-sm">
              <strong>
                Kung nakatulong sa'yo ang calculator na ito, please support me para makagawa pa ako ng mga content na makakatulong sa 3D printing journey mo. Follow me on Youtube, Facebook, TikTok and Instagram.
              </strong>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <ExternalLink
                href={s.facebookUrl}
                className="rounded-2xl border border-blue-600 bg-blue-600 px-3 py-2 text-sm text-white shadow-sm"
                title="Follow me on Facebook"
              >
                Facebook
              </ExternalLink>

              <ExternalLink
                href={s.youtubeUrl}
                className="rounded-2xl border border-red-600 bg-red-600 px-3 py-2 text-sm text-white shadow-sm"
                title="Follow me on YouTube"
              >
                YouTube
              </ExternalLink>

              <ExternalLink
                href={s.tiktokUrl}
                className="rounded-2xl border border-black bg-black px-3 py-2 text-sm text-white shadow-sm"
                title="Follow me on TikTok"
              >
                TikTok
              </ExternalLink>

              <ExternalLink
                href={s.instagramUrl}
                className="rounded-2xl border border-fuchsia-600 bg-fuchsia-600 px-3 py-2 text-sm text-white shadow-sm"
                title="Follow me on Instagram"
              >
                Instagram
              </ExternalLink>
            </div>

            <div className="mt-3 rounded-xl border bg-white p-3 text-sm">
              <div className="font-semibold">Tapo Monitoring Device I use:</div>
              <ExternalLink
                href={s.tapoUrl}
                className="mt-2 inline-block rounded-xl border px-3 py-2 text-sm shadow-sm"
                title="Open my Shopee link"
              >
                Open Shopee link
              </ExternalLink>
            </div>

            {useCount !== null && (
              <div className="mt-6 text-center text-sm text-gray-600">
                <strong>{useCount.toLocaleString()}</strong> people have used this 3D printing calculator.
              </div>
            )}
          </section>

          <section className="col-span-1 space-y-3 rounded-2xl bg-white p-4 shadow">
            <h2 className="mb-1 rounded bg-green-600 px-3 py-1 text-lg font-bold text-white">Print & Power</h2>

            <Field label="Print time" hint="Total printing duration (Kabuuang oras ng pagpi-print. Makikita rin sa slicer).">
              <div className="grid grid-cols-3 gap-2">
                <Num value={s.printTimeHours} onChange={(v) => setS({ ...s, printTimeHours: v })} placeholder="Hours" />
                <Num value={s.printTimeMinutes} onChange={(v) => setS({ ...s, printTimeMinutes: v })} placeholder="Minutes" />
                <Num value={s.printTimeSeconds} onChange={(v) => setS({ ...s, printTimeSeconds: v })} placeholder="Seconds" />
              </div>
              <div className="mt-1 text-xs text-gray-500">Decimal hours used for computation: {pretty(printTimeHoursTotal)} h</div>
            </Field>

            <Field label={`Electricity price (${PHP}/kWh)`} hint="Your electric rate per kWh (Presyo ng kuryente kada kWh. Check your electricity bill).">
              <Num value={s.kwhPrice} onChange={(v) => setS({ ...s, kwhPrice: v })} />
            </Field>

            <div className="mt-3 rounded bg-blue-600 px-3 py-2 text-center text-sm font-bold text-white">Electricity cost mode (3 ways)</div>

            <div className="mt-2 flex items-center gap-2" title="Compute using printer wattage and print time">
              <input type="checkbox" checked={modeElec === "wattage"} onChange={() => setElecMode("wattage")} />
              <span className="text-sm font-medium">Use printer wattage × print time</span>
            </div>

            {modeElec === "wattage" && (
              <Field label="Printer wattage (W)" hint="Average power draw of your printer (Average na konsumo ng kuryente ng machine. I-check sa internet ang specs ng 3D printer mo).">
                <Num value={s.wattage} onChange={(v) => setS({ ...s, wattage: v })} />
              </Field>
            )}

            <div className="my-2 text-center text-xs text-gray-400">— or —</div>

            <div className="flex items-center gap-2" title="Compute using average power (kW) based on monitoring device readings">
              <input type="checkbox" checked={modeElec === "kw"} onChange={() => setElecMode("kw")} />
              <span className="text-sm font-medium">Use average energy (kW) from monitoring device</span>
            </div>

            {modeElec === "kw" && (
              <>
                <Field label="Select printer model (kW)" hint={HELP_KW_HINT}>
                  <select
                    className="w-full rounded-xl border p-2 outline-none focus:border-gray-400"
                    value={s.kwPreset}
                    onChange={(e) => setS({ ...s, kwPreset: e.target.value })}
                  >
                    {KW_PRESETS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>

                {String(s.kwPreset) === "other" && (
                  <Field label="Custom average power (kW)" hint="Ilagay ang sarili mong kW value (average power) based sa monitoring device mo.">
                    <Num value={s.kwCustom} onChange={(v) => setS({ ...s, kwCustom: v })} step={0.001} />
                  </Field>
                )}

                <div className="rounded-xl border bg-gray-50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Selected average power</span>
                    <span className="font-semibold">{pretty(avgKw)} kW</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">Formula: (kW) × (print hours) × (₱/kWh)</div>
                </div>
              </>
            )}

            <div className="my-2 text-center text-xs text-gray-400">— or —</div>

            <div className="flex items-center gap-2" title="Set a fixed electricity cost per print hour (Example: ₱5 per hour).">
              <input type="checkbox" checked={modeElec === "php_per_hour"} onChange={() => setElecMode("php_per_hour")} />
              <span className="text-sm font-medium">Set electricity cost per hour (₱/hr)</span>
            </div>

            {modeElec === "php_per_hour" && (
              <Field label={`Electricity cost per hour (${PHP}/hr)`} hint="Example: ₱5 per hour. Formula: (₱/hr) × (print hours).">
                <Num value={s.electricityPhpPerHour} onChange={(v) => setS({ ...s, electricityPhpPerHour: v })} step={0.01} />
              </Field>
            )}

            <h2 className="mt-4 rounded bg-green-600 px-3 py-1 text-lg font-bold text-white">Labor (direct cost)</h2>
            <Field label={`Labor cost (${PHP})`} hint="Your time cost (e.g., cleaning, support removal, post-processing) (Gastos sa oras/paggawa).">
              <Num value={s.laborCost} onChange={(v) => setS({ ...s, laborCost: v })} />
            </Field>
          </section>

          <section className="col-span-1 space-y-3 rounded-2xl bg-white p-4 shadow">
            <h2 className="mb-1 rounded bg-green-600 px-3 py-1 text-lg font-bold text-white">Other Costs</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Packaging (${PHP})`} hint="Boxes, bubble wrap, labels (Kahon, bubble wrap, label).">
                <Num value={s.packaging} onChange={(v) => setS({ ...s, packaging: v })} />
              </Field>
              <Field label={`Paint (${PHP})`} hint="Paints, primers, sealers (Pintura, primer, sealer).">
                <Num value={s.paint} onChange={(v) => setS({ ...s, paint: v })} />
              </Field>
              <Field label={`Adhesives (${PHP})`} hint="Glue, epoxy, CA, tape (Pandikit, epoxy, CA).">
                <Num value={s.adhesives} onChange={(v) => setS({ ...s, adhesives: v })} />
              </Field>
              <Field label={`Shipping (${PHP})`} hint="Courier fees or delivery cost (Bayad sa courier o delivery).">
                <Num value={s.shipping} onChange={(v) => setS({ ...s, shipping: v })} />
              </Field>
              <Field label={`3D modeling fee (${PHP})`} hint="Fee for 3D design/modelling work (Bayad para sa 3D design/modelling).">
                <Num value={s.modelingFee} onChange={(v) => setS({ ...s, modelingFee: v })} />
              </Field>
            </div>

            <h2 className="mt-4 rounded bg-green-600 px-3 py-1 text-lg font-bold text-white">Margins</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Failure margin (%)" hint="Covers misprints/waste (Isinasaalang-alang ang posibleng misprints/sayang).">
                <Num value={s.failureMarginPct} onChange={(v) => setS({ ...s, failureMarginPct: v })} />
              </Field>
              <Field label="Profit markup (%)" hint="Your profit on top of costs (Tubong idinadagdag sa lahat ng gastos).">
                <Num value={s.markupPct} onChange={(v) => setS({ ...s, markupPct: v })} />
              </Field>
            </div>

            <h2 className="mt-4 rounded bg-yellow-400 px-3 py-1 text-lg font-bold text-black">Computed Summary</h2>
            <div className="space-y-2 rounded-xl border p-3 text-sm">
              <Row label="Price/gram">{PHP} {pretty(pricePerGram)} / g</Row>
              <Row label="Material cost">{PHP} {pretty(materialCost)}</Row>
              <Row label="Electricity cost">{PHP} {pretty(electricityCost)}</Row>
              <Row label="Labor cost">{PHP} {pretty(laborCostNum)}</Row>
              <Row label="Packaging">{PHP} {pretty(packagingCost)}</Row>
              <Row label="Paint">{PHP} {pretty(paintCost)}</Row>
              <Row label="Adhesives">{PHP} {pretty(adhesivesCost)}</Row>

              <hr />

              <Row label="3D modeling fee">{PHP} {pretty(modelingFeeCost)}</Row>

              <hr />

              <Row label="Shipping fee">{PHP} {pretty(shippingCost)}</Row>

              <hr />

              <Row label="Subtotal">{PHP} {pretty(baseSubtotal)}</Row>
              <Row label={`Failure margin (${s.failureMarginPct}%)`}>{PHP} {pretty(failureMarginAmount)}</Row>
              <Row label={`Mark Up (${s.markupPct}% of subtotal)`}>{PHP} {pretty(markupAmount)}</Row>
              <Row label="Final Price" strong>{PHP} {pretty(finalPrice)}</Row>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-2 text-lg font-semibold">Saved Computations (max 3)</h2>
          {!s.saves || s.saves.length === 0 ? (
            <p className="text-sm text-gray-500">No saves yet. After entering details, click <strong>Save</strong>. (Wala pang save. Maglagay ng detalye at i-click ang <strong>Save</strong>.)</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {s.saves.map((entry, i) => (
                <div key={i} className="rounded-xl border p-3 text-sm">
                  <div className="font-medium">{i + 1}. {entry.name}</div>
                  <div className="text-xs text-gray-500">{fmtDate(entry.ts)}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="rounded border px-2 py-1" onClick={() => loadSave(i)}>Load</button>
                    <button className="rounded border px-2 py-1 text-red-600" onClick={() => deleteSave(i)}>Delete</button>
                    <button className="rounded border px-2 py-1" onClick={() => downloadOneSave(i)}>Download (.csv)</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3">
            <button onClick={downloadAllSaves} className="rounded-2xl border px-3 py-2 text-sm shadow-sm">Download All (.csv)</button>
          </p>
        </section>

        <footer className="mt-6 text-center text-xs text-gray-500">Built for GitHub Pages · DS3DP v1.5 · PHP only</footer>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-1" title={hint}>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint ? <div className="text-xs text-gray-500">{hint}</div> : null}
    </div>
  );
}

function Num({ value, onChange, min, step = 0.01, placeholder }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      step={step}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border p-2 outline-none focus:border-gray-400"
    />
  );
}

function Row({ label, children, strong }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={strong ? "font-semibold" : undefined}>{children}</span>
    </div>
  );
}
