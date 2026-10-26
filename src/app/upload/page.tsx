"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import * as XLSX from "xlsx";
import { Download, Upload } from "@/components/icons";

export default function UploadPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function handle(file: File) {
    setError(null);
    if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
      setError("Please upload an Excel workbook (.xlsx) in the Case 2 template format.");
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      // Keep a copy of the original file so the updated workbook can be rebuilt from it (up to 3 MB).
      const fileBase64 = buf.byteLength <= 3_000_000 ? toBase64(buf) : undefined;
      // Only send the sheets we need; Carrier options and Rulebook are fixed in the app.
      const sheets: Record<string, unknown[][]> = {};
      for (const name of wb.SheetNames) {
        const n = name.toLowerCase();
        if (n.includes("carrier") || n.includes("rule") || n.includes("glossary") || n.includes("allowed") || n.includes("guide")) continue;
        const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
        sheets[name] = rows.slice(0, 5000).map((r) => r.slice(0, 40));
      }
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, sheets, fileBase64 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed.");
      router.push(`/audit/${json.uploadId}`);
    } catch (e) {
      setError((e as Error).message || "That file couldn't be read.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="eyebrow">Workbook audit</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-slate-900">Audit every booking in one upload</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-600">
        Upload your <b>Bookings</b> and <b>Items</b> spreadsheet. CargoPilot checks every booking against 10 rules and suggests a carrier for
        each one. Your file is never changed.
      </p>

      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
        className={`mt-8 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center shadow-sm transition ${drag ? "border-teal-600 bg-teal-50/60" : "border-slate-200 bg-white hover:border-teal-500 hover:bg-teal-50/20"}`}
      >
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 ring-8 ring-teal-50/50">
          <Upload className="h-6 w-6 text-teal-700" />
        </span>
        {busy ? (
          <div className="text-sm font-medium text-slate-700">Reading your workbook and running every check…</div>
        ) : (
          <>
            <div className="text-base font-medium text-slate-900">Drop your workbook here, or browse</div>
            <div className="text-xs text-slate-500">.xlsx in the Case 2 format · Bookings and Items sheets · dates as DD-MM-YYYY · GBP</div>
          </>
        )}
        <input type="file" accept=".xlsx,.xlsm,.xls" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ""; }} />
      </label>
      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <a href="/samples/cargopilot-sample-audit.xlsx" className="card flex items-start gap-3 p-4 transition hover:border-teal-400 hover:shadow-md">
          <Download className="mt-0.5 h-5 w-5 text-teal-700" />
          <div>
            <div className="text-sm font-semibold text-slate-900">Try the sample workbook</div>
            <div className="text-xs text-slate-600">Eight bookings with deliberate mistakes. Download it, then drop it above.</div>
          </div>
        </a>
        <a href="/samples/Case2_Shipment_Booking_Test_Data_Format.xlsx" className="card flex items-start gap-3 p-4 transition hover:border-teal-400 hover:shadow-md">
          <Download className="mt-0.5 h-5 w-5 text-teal-700" />
          <div>
            <div className="text-sm font-semibold text-slate-900">Blank template</div>
            <div className="text-xs text-slate-600">The Case 2 format, ready for your own bookings. The grey example row is skipped automatically.</div>
          </div>
        </a>
      </div>
    </div>
  );
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
