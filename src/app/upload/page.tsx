"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Upload } from "@/components/icons";
import { gsap, reducedMotion, useGSAP } from "@/components/motion/gsap";
import { Reveal, SplitHeadline } from "@/components/motion/primitives";
import { toast } from "@/components/motion/Toaster";
import { RULEBOOK } from "@/lib/constants";

// Progress lines shown while the audit runs (the checks themselves happen on the server in one request).
const STEPS = ["Reading the Bookings and Items sheets", "Matching items to their bookings", ...RULEBOOK.map((r) => `${r.id} ${r.short}`), "Ranking carriers for each priority"];

export default function UploadPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const zone = useRef<HTMLLabelElement>(null);

  // Advance the progress log while the request is in flight; it waits on the last line until the server answers.
  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const id = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 260);
    return () => window.clearInterval(id);
  }, [busy]);

  // The drop zone leans in when a file is dragged over it.
  useGSAP(() => {
    if (!zone.current || reducedMotion()) return;
    gsap.to(zone.current, { scale: drag ? 1.015 : 1, duration: 0.35, ease: "manifest" });
  }, { dependencies: [drag] });

  // Accepts one workbook, or the Bookings and Items sheets as separate files (.xlsx or .csv).
  async function handle(list: FileList | File[]) {
    setError(null);
    const picked = [...list];
    const bad = picked.find((f) => !/\.(xlsx|xlsm|xls|csv)$/i.test(f.name));
    if (picked.length === 0) return;
    if (bad) {
      setError(`"${bad.name}" isn't a spreadsheet. Upload an Excel workbook (.xlsx) or the Bookings and Items sheets as .xlsx or .csv files.`);
      return;
    }
    setFiles(picked.map((f) => f.name));
    setBusy(true);
    try {
      const sheets: Record<string, unknown[][]> = {};
      let fileBase64: string | undefined;
      for (const file of picked) {
        const isCsv = /\.csv$/i.test(file.name);
        // CSV values stay as text so HS codes keep leading zeros; the server parses numbers itself.
        const wb = isCsv ? XLSX.read(await file.text(), { type: "string", raw: true }) : XLSX.read(await file.arrayBuffer());
        // Keep a copy of a single uploaded workbook so the updated workbook can be rebuilt from it (up to 3 MB).
        if (picked.length === 1 && !isCsv && file.size <= 3_000_000) fileBase64 = toBase64(await file.arrayBuffer());
        for (const name of wb.SheetNames) {
          const n = name.toLowerCase();
          // Carrier options and Rulebook are fixed in the app; only the Bookings and Items sheets are read.
          if (n.includes("carrier") || n.includes("rule") || n.includes("glossary") || n.includes("allowed") || n.includes("guide")) continue;
          const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
          // With several files, prefix the file name so "Sheet1" in two files can't collide (and "bookings.csv" is recognised).
          sheets[picked.length > 1 || isCsv ? `${file.name} / ${name}` : name] = rows.slice(0, 5000).map((r) => r.slice(0, 40));
        }
      }
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: picked.map((f) => f.name).join(" + ").slice(0, 255), sheets, fileBase64 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed.");
      toast("Audit complete", { body: "Opening the results" });
      router.push(`/audit/${json.uploadId}`);
    } catch (e) {
      setError((e as Error).message || "That file couldn't be read.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Reveal>
        <div data-reveal className="eyebrow">Workbook audit</div>
      </Reveal>
      <SplitHeadline className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Audit every booking in one upload</SplitHeadline>
      <Reveal delay={0.2}>
        <p data-reveal className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600">
          Upload your <b>Bookings</b> and <b>Items</b> spreadsheet. CargoPilot checks every booking against 10 rules and suggests a carrier for
          each one. Your file is never changed.
        </p>
      </Reveal>

      <label
        data-tour="drop-area"
        ref={zone}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
        className={`spotlight mt-10 block cursor-pointer rounded-[14px] border border-dashed transition-colors ${busy || drag ? "border-beam border-transparent" : "border-slate-300 hover:border-teal-500"} ${drag ? "bg-teal-50" : "bg-[var(--color-card)]"}`}
      >
        {busy ? (
          <div className="grid gap-6 p-6 sm:grid-cols-[1fr_1.3fr] sm:p-8">
            <div>
              <div className="label-xs flex items-center gap-1.5"><span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--color-signal)] text-[var(--color-signal)]" /> Running pre-flight checks</div>
              <div className="mt-2 text-lg font-bold text-slate-900">{files.length > 1 ? `${files.length} files` : files[0]}</div>
              <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-[var(--color-signal)] transition-[width] duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
              </div>
              <p className="mt-2 font-mono text-[11px] text-slate-500">{step + 1} / {STEPS.length}</p>
            </div>
            <ol className="max-h-56 overflow-hidden rounded-[10px] border border-[var(--color-line)] bg-[var(--color-paper)] p-4 font-mono text-[12px] leading-6 text-slate-700">
              {STEPS.slice(Math.max(0, step - 7), step + 1).map((s, i, arr) => (
                <li key={s} className={i === arr.length - 1 ? "text-slate-900" : "text-slate-500"}>
                  <span className={i === arr.length - 1 ? "text-[var(--color-signal)]" : "text-emerald-500"}>{i === arr.length - 1 ? "›" : "✓"}</span> {s}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <span className={`inline-flex h-14 w-14 items-center justify-center rounded-[12px] transition-colors ${drag ? "bg-[var(--color-signal)] text-[var(--color-on-signal)]" : "border border-teal-200 bg-teal-50 text-teal-700"}`}>
              <Upload className="h-6 w-6" />
            </span>
            <div className="mt-2 text-lg font-bold text-slate-900">{drag ? "Drop to start the audit" : "Drop your workbook here, or browse"}</div>
            <div className="text-xs text-slate-500">.xlsx or .csv · Bookings + Items · dates DD-MM-YYYY · GBP</div>
          </div>
        )}
        <input type="file" multiple accept=".xlsx,.xlsm,.xls,.csv" className="hidden" disabled={busy} onChange={(e) => { if (e.target.files) handle(e.target.files); e.target.value = ""; }} />
      </label>
      {error && <div className="mt-4 rounded-[8px] border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <Reveal scroll className="mt-8 grid gap-3 sm:grid-cols-2">
        <SampleLink href="/samples/cargopilot-sample-audit.xlsx" title="Try the sample workbook" body="Eight bookings with deliberate mistakes. Download it, then drop it above." />
        <SampleLink href="/samples/Case2_Shipment_Booking_Test_Data_Format.xlsx" title="Blank template" body="The Case 2 format, ready for your own bookings. The grey example row is skipped automatically." />
      </Reveal>
    </div>
  );
}

function SampleLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <a data-reveal href={href} className="card spotlight group flex items-start gap-3 p-4 transition-colors hover:border-teal-500">
      <Download className="mt-0.5 h-5 w-5 text-teal-700 transition-transform group-hover:translate-y-0.5" />
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="text-xs text-slate-600">{body}</div>
      </div>
    </a>
  );
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
