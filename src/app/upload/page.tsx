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
      const wb = XLSX.read(await file.arrayBuffer());
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
        body: JSON.stringify({ fileName: file.name, sheets }),
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
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Upload a workbook to audit</h1>
      <p className="mt-1 text-sm text-slate-600">
        Upload the <b>Bookings</b> and <b>Items</b> sheets in the Case 2 template format. Every booking and item row is checked against the 10-rule
        rulebook, and each booking gets a carrier recommendation. Your file is read, never changed.
      </p>

      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
        className={`mt-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-12 text-center transition ${drag ? "border-teal-600 bg-teal-50" : "border-slate-300 bg-white hover:border-teal-500"}`}
      >
        <Upload className="h-10 w-10 text-teal-700" />
        {busy ? (
          <div className="text-sm font-medium text-slate-700">Reading the workbook and running all checks…</div>
        ) : (
          <>
            <div className="text-base font-medium text-slate-900">Drop your .xlsx here, or click to choose</div>
            <div className="text-xs text-slate-500">Sheets needed: Bookings, Items · dates as DD-MM-YYYY · GBP</div>
          </>
        )}
        <input type="file" accept=".xlsx,.xlsm,.xls" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ""; }} />
      </label>
      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <a href="/samples/cargopilot-sample-audit.xlsx" className="card flex items-start gap-3 p-4 hover:border-teal-500">
          <Download className="mt-0.5 h-5 w-5 text-teal-700" />
          <div>
            <div className="text-sm font-semibold text-slate-900">Sample workbook with planted errors</div>
            <div className="text-xs text-slate-600">8 bookings that break different rules — download it, then upload it here.</div>
          </div>
        </a>
        <a href="/samples/Case2_Shipment_Booking_Test_Data_Format.xlsx" className="card flex items-start gap-3 p-4 hover:border-teal-500">
          <Download className="mt-0.5 h-5 w-5 text-teal-700" />
          <div>
            <div className="text-sm font-semibold text-slate-900">Blank Case 2 template</div>
            <div className="text-xs text-slate-600">The original format, with the grey example row (skipped automatically when you add your own rows).</div>
          </div>
        </a>
      </div>
    </div>
  );
}
