import React, { useEffect, useMemo, useState } from "react";

/**
 * Dr Shiela 3D Prints 3D Printing Calculator — Full Production (single-file App.jsx)
 * - Column 1: Material Cost (with "Price per Gram (2 Ways. Choose 1)" + Filament Consumed (g))
 * - Column 2: Print & Power + Labor
 * - Column 3: Other Costs + Depreciation + Margins + Computed Summary
 * - Save/Load/Delete up to 3 named slots
 * - Download All (.csv) and per-save (.csv) — Excel-friendly
 * - Local persistence via localStorage
 */

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
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
  }, [key, state]);
  return [state, setState];
}

export default function App() {
  const [s, setS] = usePersistedState("ds3dp_full_v1", {
    label: "Dr Shiela 3D Prints 3D Printing Calculator",

    // Mutually exclusive pricing option: 'derive' or 'fixed'
    pricingMode: "derive",
    spoolPrice: 800,           // PHP
    spoolWeight: 1000,         // g
    fixedPerGram: 2.0,         // PHP/g

    // Usage (shown as Filament consumed)
    partWeight: "",            // g

    // Print & power
    printTimeHours: 6,
    wattage: 120,              // W
    kwhPrice: 12,              // PHP/kWh

    // Labor (flat)
    laborCost: 0,

    // Other costs
    packaging: 0,
    paint: 0,
    adhesives: 0,
    shipping: 0,

    // Optional depreciation
    useDepreciation: false,
    depreciationRatePerHour: 15, // PHP/hr

    // Margins
    failureMarginPct: 10,
    markupPct: 20,

    // Likes (device-local only)
    likesCount: Number(localStorage.getItem("ds3dp_likesCount") || 0),
    liked: JSON.parse(localStorage.getItem("ds3dp_liked") || "false"),

    // Links
    facebookUrl: "https://www.facebook.com/drshiela3dprints/",
    youtubeUrl: "https://www.youtube.com/@DrShiela3DPrints",

    // Saves (up to 3)
    saves: [],                 // [{ name, ts, data }]
    productName: "",
  });

  const PHP = "₱";

  // Derived price per gram
  const pricePerGram = useMemo(() => {
    if (s.pricingMode === "fixed") return Number(s.fixedPerGram) || 0;
    const p = Number(s.spoolPrice);
    const w = Number(s.spoolWeight);
    return w > 0 ? p / w : 0;
  }, [s.pricingMode, s.fixedPerGram, s.spoolPrice, s.spoolWeight]);

  const weight_g = Number(s.partWeight) > 0 ? Number(s.partWeight) : 0;
  const materialCost = weight_g * pricePerGram;
  const electricityCost = (Number(s.wattage) * Number(s.printTimeHours) / 1000) * Number(s.kwhPrice);
  const depreciationCost = s.useDepreciation ? Number(s.depreciationRatePerHour) * Number(s.printTimeHours) : 0;
  const otherCosts = Number(s.packaging) + Number(s.paint) + Number(s.adhesives) + Number(s.shipping);
  const baseSubtotal = materialCost + electricityCost + Number(s.laborCost) + otherCosts + depreciationCost;
  const withFailure = baseSubtotal * (1 + Number(s.failureMarginPct) / 100);
  const finalPrice = withFailure * (1 + Number(s.markupPct) / 100);

  // Like button
  const toggleLike = () => {
    if (s.liked) return;
    const next = (Number(s.likesCount) || 0) + 1;
    setS({ ...s, likesCount: next, liked: true });
    localStorage.setItem("ds3dp_liked", "true");
    localStorage.setItem("ds3dp_likesCount", String(next));
  };

  const setMode = (mode) => setS({ ...s, pricingMode: mode });

  // ===== SAVE/LOAD/DELETE (max 3) =====
  const doSave = () => {
    let name = (s.productName || "").trim();
    if (!name) {
      const typed = prompt("Enter product name to save (Ilagay ang pangalan ng produkto):");
      if (!typed) return;
      name = String(typed).trim();
    }
    // exclude volatile fields
    const { saves, productName, ...data } = s;
    const snapshot = { name, ts: Date.now(), data };

    let newSaves = Array.isArray(s.saves) ? [...s.saves] : [];
    if (newSaves.length >= 3) {
      const confirmOverride = confirm(
        `You already have 3 saves. Override the 1st save with "${newSaves[0].name}" and push others down?\n\n` +
        `May 3 saves ka na. I-override ang unang save ("${newSaves[0].name}") at itulak pababa ang iba?`
      );
      if (!confirmOverride) return;
      newSaves = [snapshot, ...newSaves].slice(0, 3);
    } else {
      newSaves = [snapshot, ...newSaves];
    }
    setS({ ...s, saves: newSaves, productName: name });
    alert(`Saved: ${name}`);
  };

  const loadSave = (idx) => {
    const entry = s.saves[idx];
    if (!entry) return;
    const loaded = { ...entry.data, saves: s.saves, productName: entry.name };
    setS(loaded);
  };

  const deleteSave = (idx) => {
    const entry = s.saves[idx];
    if (!entry) return;
    const ok = confirm(`Delete save "${entry.name}"? (Burahin ang save na ito?)`);
    if (!ok) return;
    const newSaves = s.saves.filter((_, i) => i !== idx);
    setS({ ...s, saves: newSaves });
  };

  // ===== CSV EXPORT =====
  const csvHeaders = [
    "Name","Saved At","Pricing Mode","Spool Price","Spool Weight (g)","Fixed Price/g",
    "Filament Consumed (g)","Print Time (hrs)","Wattage (W)","kWh Price",
    "Labor Cost","Packaging","Paint","Adhesives","Shipping",
    "Use Depreciation","Depreciation (PHP/hr)","Failure Margin %","Markup %",
    "Price/gram","Material Cost","Electricity Cost","Other Costs","Depreciation Cost",
    "Subtotal","With Failure","Final Price"
  ];

  const csvEscape = (v) => {
    const s = String(v ?? "");
    const esc = typeof s.replaceAll === "function" ? s.replaceAll('"','""') : s.replace(/"/g,'""');
    return `"${esc}"`;
  };

  const toCsvRow = (entry) => {
    const d = entry.data;
    const ppg = d.pricingMode === 'fixed'
      ? Number(d.fixedPerGram)||0
      : (Number(d.spoolPrice)||0) / ((Number(d.spoolWeight)||0) || 1);

    const weight = Number(d.partWeight)||0;
    const mat = weight * ppg;
    const elec = ( (Number(d.wattage)||0) * (Number(d.printTimeHours)||0) / 1000 ) * (Number(d.kwhPrice)||0);
    const dep = d.useDepreciation ? (Number(d.depreciationRatePerHour)||0) * (Number(d.printTimeHours)||0) : 0;
    const others = (Number(d.packaging)||0) + (Number(d.paint)||0) + (Number(d.adhesives)||0) + (Number(d.shipping)||0);
    const sub = mat + elec + (Number(d.laborCost)||0) + others + dep;
    const withFail = sub * (1 + (Number(d.failureMarginPct)||0)/100);
    const fin = withFail * (1 + (Number(d.markupPct)||0)/100);

    const cells = [
      entry.name,
      new Date(entry.ts).toLocaleString(),
      d.pricingMode,
      d.spoolPrice,
      d.spoolWeight,
      d.fixedPerGram,
      d.partWeight,
      d.printTimeHours,
      d.wattage,
      d.kwhPrice,
      d.laborCost,
      d.packaging,
      d.paint,
      d.adhesives,
      d.shipping,
      d.useDepreciation ? "Yes" : "No",
      d.depreciationRatePerHour,
      d.failureMarginPct,
      d.markupPct,
      ppg,
      mat,
      elec,
      others,
      dep,
      sub,
      withFail,
      fin,
    ];
    return cells.map(v => (typeof v === "string" ? csvEscape(v) : v)).join(",");
  };

  const downloadCSV = (rows, filename) => {
    const blob = new Blob(
      ["\uFEFF" + csvHeaders.join(",") + "\n" + rows.join("\n")],
      { type: "text/csv;charset=utf-8;" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadOneSave = (idx) => {
    const entry = s.saves[idx];
    if (!entry) return;
    downloadCSV([toCsvRow(entry)], `${entry.name || "save"}`);
  };

  const downloadAllSaves = () => {
    if (!s.saves || s.saves.length === 0) { alert("No saves to download."); return; }
    const rows = s.saves.map(toCsvRow);
    downloadCSV(rows, `DS3DP_Saves_${new Date().toISOString().slice(0,10)}`);
  };

  const fmtDate = (ts) => new Date(ts).toLocaleString();

  // ===== UI =====
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        {/* Header + Save controls */}
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{s.label}</h1>
            <p className="text-sm text-gray-600">
              PHP-only · Persists on refresh · Hover labels for English/Tagalog help.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm">Product:</label>
              <input
                className="rounded-xl border p-2 text-sm"
                placeholder="Enter product name (Pangalan ng produkto)"
                value={s.productName}
                onChange={(e)=>setS({ ...s, productName: e.target.value })}
                title="Used as the file name for saves (Gagamitin bilang pangalan ng file sa save)"
              />
            </div>
            <button onClick={doSave} className="rounded-2xl border px-3 py-2 text-sm shadow-sm">Save</button>
            <button onClick={downloadAllSaves} className="rounded-2xl border px-3 py-2 text-sm shadow-sm">Download All (.csv)</button>
            <button onClick={()=>setMode(s.pricingMode === 'derive' ? 'fixed' : 'derive')} className="rounded-2xl border px-3 py-2 text-sm shadow-sm">Toggle Mode</button>
          </div>
        </header>

        {/* Grid: 3 columns */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* LEFT: Material Cost */}
          <section className="col-span-1 space-y-3 rounded-2xl bg-white p-4 shadow">
            <h2 className="mb-1 text-lg font-semibold">Material Cost</h2>
            <h3 className="-mt-1 text-sm text-gray-600">Price per Gram (2 Ways. Choose 1)</h3>

            {/* Derive from spool */}
            <div className="mt-2 flex items-center gap-2" title="Use spool price and weight to compute PHP/g (Gamitin ang presyo at bigat ng spool para sa PHP/g)">
              <input type="checkbox" checked={s.pricingMode === 'derive'} onChange={() => setMode('derive')} />
              <label className="font-medium">Derive from spool</label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Spool price (${PHP})`} hint="Total cost of one filament spool (Kung magkano mo nabili ang 1 spool ng filament).">
                <Num value={s.spoolPrice} onChange={(v)=>setS({...s, spoolPrice:v})} />
              </Field>
              <Field label="Spool weight (g)" hint="Weight of the entire spool, usually 1000 g (Bigat ng buong spool, usually 1000 g (1kg)).">
                <Num value={s.spoolWeight} onChange={(v)=>setS({...s, spoolWeight:v})} />
              </Field>
            </div>

            <div className="my-2 text-center text-xs text-gray-400">— or —</div>

            {/* Fixed per gram */}
            <div className="flex items-center gap-2" title="Use your own PHP/g (Gamitin ang sarili mong PHP/g)">
              <input type="checkbox" checked={s.pricingMode === 'fixed'} onChange={() => setMode('fixed')} />
              <label className="font-medium">Fixed price/gram ({PHP}/g)</label>
            </div>
            <Field label={`Set price (${PHP}/g)`} hint="Your set selling rate per gram (Kung ano yung rate mo per gram).">
              <Num value={s.fixedPerGram} onChange={(v)=>setS({...s, fixedPerGram:v})} />
            </Field>

            {/* Usage moved here */}
            <h3 className="mt-4 text-lg font-semibold">Usage</h3>
            <Field label="Filament consumed (g)" hint="From your slicer’s estimate (Mula sa estimate ng slicer. Makikita mo sa preview after mag-slice).">
              <Num value={s.partWeight} onChange={(v)=>setS({...s, partWeight:v})} />
            </Field>
          </section>

          {/* MIDDLE: Print & Power + Labor */}
          <section className="col-span-1 space-y-3 rounded-2xl bg-white p-4 shadow">
            <h2 className="mb-1 text-lg font-semibold">Print & Power</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Print time (hours)" hint="Total printing duration (Kabuuang oras ng pagpi-print. Makikita rin sa slicer).">
                <Num value={s.printTimeHours} onChange={(v)=>setS({...s, printTimeHours:v})} />
              </Field>
              <Field label="Printer wattage (W)" hint="Average power draw of your printer (Karaniwang konsumo ng kuryente ng machine).">
                <Num value={s.wattage} onChange={(v)=>setS({...s, wattage:v})} />
              </Field>
            </div>
            <Field label={`Electricity price (${PHP}/kWh)`} hint="Your electric rate per kWh (Presyo ng kuryente kada kWh. Check you electricity bill).">
              <Num value={s.kwhPrice} onChange={(v)=>setS({...s, kwhPrice:v})} />
            </Field>

            <h2 className="mt-4 text-lg font-semibold">Labor (direct cost)</h2>
            <Field label={`Labor cost (${PHP})`} hint="Your time cost (e.g., cleaning, support removal, post-processing) (Gastos sa oras/ paggawa).">
              <Num value={s.laborCost} onChange={(v)=>setS({...s, laborCost:v})} />
            </Field>
          </section>

          {/* RIGHT: Other Costs + Depreciation + Margins + Summary */}
          <section className="col-span-1 space-y-3 rounded-2xl bg-white p-4 shadow">
            <h2 className="mb-1 text-lg font-semibold">Other Costs</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Packaging (${PHP})`} hint="Boxes, bubble wrap, labels (Kahon, bubble wrap, label).">
                <Num value={s.packaging} onChange={(v)=>setS({...s, packaging:v})} />
              </Field>
              <Field label={`Paint (${PHP})`} hint="Paints, primers, sealers (Pintura, primer, sealer).">
                <Num value={s.paint} onChange={(v)=>setS({...s, paint:v})} />
              </Field>
              <Field label={`Adhesives (${PHP})`} hint="Glue, epoxy, CA, tape (Pandikit, epoxy, CA).">
                <Num value={s.adhesives} onChange={(v)=>setS({...s, adhesives:v})} />
              </Field>
              <Field label={`Shipping (${PHP})`} hint="Courier fees or delivery cost (Bayad sa courier o delivery).">
                <Num value={s.shipping} onChange={(v)=>setS({...s, shipping:v})} />
              </Field>
            </div>

            <h2 className="mt-4 text-lg font-semibold">Depreciation (optional)</h2>
            <label className="flex items-center gap-2 text-sm" title="Enable printer/tooling wear per hour (I-activate ang depreciation kada oras)">
              <input type="checkbox" checked={s.useDepreciation} onChange={(e)=>setS({...s, useDepreciation:e.target.checked})} /> Enable depreciation (I-activate ang depreciation)
            </label>
            {s.useDepreciation ? (
              <Field label={`Rate (${PHP}/hr)`} hint="Your printer/tooling wear per hour (Pagkaluma ng printer kada oras).">
                <Num value={s.depreciationRatePerHour} onChange={(v)=>setS({...s, depreciationRatePerHour:v})} />
              </Field>
            ) : null}

            <h2 className="mt-4 text-lg font-semibold">Margins</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Failure margin (%)" hint="Covers misprints/waste (Isinasaalang-alang ang mga posibleng pagkakamali sa pagpi-print, mga sirang output, o nasasayang na filament sa proseso ng 3D printing).">
                <Num value={s.failureMarginPct} onChange={(v)=>setS({...s, failureMarginPct:v})} />
              </Field>
              <Field label="Profit markup (%)" hint="Your profit on top of costs (Tubong idinadagdag sa lahat ng gastos).">
                <Num value={s.markupPct} onChange={(v)=>setS({...s, markupPct:v})} />
              </Field>
            </div>

            <h2 className="mt-4 text-lg font-semibold">Computed Summary</h2>
            <div className="space-y-2 rounded-xl border p-3 text-sm">
              <Row label="Price/gram">{PHP} {pretty(pricePerGram)} / g</Row>
              <Row label="Material cost">{PHP} {pretty(materialCost)}</Row>
              <Row label="Electricity cost">{PHP} {pretty(electricityCost)}</Row>
              <Row label="Labor cost">{PHP} {pretty(Number(s.laborCost))}</Row>
              <Row label="Other costs (pkg+paint+adh+ship)">{PHP} {pretty(otherCosts)}</Row>
              {s.useDepreciation ? <Row label="Depreciation">{PHP} {pretty(depreciationCost)}</Row> : null}
              <hr />
              <Row label="Subtotal">{PHP} {pretty(baseSubtotal)}</Row>
              <Row label={`+ Failure margin (${s.failureMarginPct}%)`}>{PHP} {pretty(withFailure)}</Row>
              <Row label={`Final price (+ markup ${s.markupPct}%)`} strong>
                {PHP} {pretty(finalPrice)}
              </Row>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button onClick={toggleLike} className={`rounded-2xl px-3 py-2 text-sm shadow-sm border ${s.liked ? 'bg-gray-100' : 'bg-white'}`} title={s.liked ? 'Thanks!' : 'Like this calculator'}>
                👍 Like <span className="ml-1 inline-block rounded bg-gray-200 px-2 text-xs">{pretty(s.likesCount)}</span>
              </button>
              <div className="flex gap-2">
                <a href={s.facebookUrl} target="_blank" rel="noreferrer" className="rounded-2xl border px-3 py-2 text-sm shadow-sm" title="Follow me on Facebook for more 3D printing tips (I-follow ako sa Facebook para sa more 3D printing tips)">Facebook</a>
                <a href={s.youtubeUrl} target="_blank" rel="noreferrer" className="rounded-2xl border px-3 py-2 text-sm shadow-sm" title="Follow me on YouTube for more 3D printing tips (Sundan ninyo ako sa YouTube para sa more 3D printing tips)">YouTube</a>
              </div>
            </div>
          </section>
        </div>

        {/* Saves list with per-save download */}
        <section className="mt-6 rounded-2xl bg-white p-4 shadow">
          <h2 className="text-lg font-semibold mb-2">Saved Computations (max 3)</h2>
          {(!s.saves || s.saves.length === 0) ? (
            <p className="text-sm text-gray-500">
              No saves yet. After entering details, click <strong>Save</strong>. (Wala pang save. Maglagay ng detalye at i-click ang <strong>Save</strong>.)
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {s.saves.map((entry, i) => (
                <div key={i} className="rounded-xl border p-3 text-sm">
                  <div className="font-medium">{i+1}. {entry.name}</div>
                  <div className="text-xs text-gray-500">{fmtDate(entry.ts)}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="rounded border px-2 py-1" onClick={()=>loadSave(i)}>Load</button>
                    <button className="rounded border px-2 py-1" onClick={()=>deleteSave(i)}>Delete</button>
                    <button className="rounded border px-2 py-1" onClick={()=>downloadOneSave(i)}>Download (.csv)</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3">
            <button onClick={downloadAllSaves} className="rounded-2xl border px-3 py-2 text-sm shadow-sm">
              Download All (.csv)
            </button>
          </p>
        </section>

        <footer className="mt-6 text-center text-xs text-gray-500">
          Built for GitHub Pages · DS3DP · PHP only
        </footer>
      </div>
    </div>
  );
}

/* ---------- Small helper components ---------- */
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
      onChange={(e)=>onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border p-2 outline-none focus:border-gray-400"
    />
  );
}
function Row({ label, children, strong }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={strong ? 'font-semibold' : undefined}>{children}</span>
    </div>
  );
}
