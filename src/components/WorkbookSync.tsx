"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { loadUpload } from "@/lib/server/uploads";
import { Download } from "./icons";

type Google = NonNullable<Awaited<ReturnType<typeof loadUpload>>>["google"];

// "Download updated workbook" + live Google Sheet sync for one audit.
export function WorkbookSync({ uploadId, google }: { uploadId: string; google: Google }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function call(method: "POST" | "PUT" | "DELETE", body?: object) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/uploads/${uploadId}/google`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(json.error ?? "Something went wrong.");
    else router.refresh();
  }

  const sheetLink = google.sheetId ? `https://docs.google.com/spreadsheets/d/${google.sheetId}/edit` : null;

  return (
    <section className="card grid gap-4 p-4 md:grid-cols-2">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Updated workbook</h2>
        <p className="mt-1 text-xs text-slate-600">
          Your original sheets, untouched, plus <b>CargoPilot Changes</b> (every edit grouped by Booking ID), <b>Bookings (corrected)</b> and{" "}
          <b>Items (corrected)</b> with changed cells highlighted. Always reflects the latest edits.
        </p>
        <a href={`/api/uploads/${uploadId}/workbook`} className="btn-primary mt-3">
          <Download className="h-4 w-4" /> Download updated workbook
        </a>
      </div>

      <div className="md:border-l md:border-slate-100 md:pl-4">
        <h2 className="text-sm font-semibold text-slate-900">Live Google Sheet</h2>
        {!google.enabled ? (
          <p className="mt-1 text-xs text-slate-600">Google Sheets sync isn&apos;t switched on for this server yet. The download above works in the meantime.</p>
        ) : sheetLink ? (
          <div className="mt-1 space-y-2 text-xs text-slate-600">
            <p>
              Connected to{" "}
              <a href={sheetLink} target="_blank" rel="noreferrer" className="font-medium text-teal-700 hover:underline">
                your Google Sheet ↗
              </a>
              . The CargoPilot tabs update automatically after every change.
            </p>
            <p>
              {google.syncedAt
                ? `Last synced ${new Date(google.syncedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`
                : "Not synced yet."}
            </p>
            {google.error && <p className="rounded bg-red-50 px-2 py-1 text-red-800">{google.error}</p>}
            <div className="flex gap-2">
              <button className="btn-ghost text-xs" disabled={busy} onClick={() => call("PUT")}>{busy ? "Syncing…" : "Sync now"}</button>
              <button className="btn-ghost text-xs" disabled={busy} onClick={() => call("DELETE")}>Disconnect</button>
            </div>
          </div>
        ) : (
          <form
            className="mt-1 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) call("POST", { sheetUrl: url.trim() });
            }}
          >
            <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-600">
              <li>
                In Google Sheets, click <b>Share</b> and add{" "}
                <button
                  type="button"
                  className="rounded bg-slate-100 px-1 font-mono text-[11px] text-slate-800 hover:bg-slate-200"
                  title="Copy"
                  onClick={() => {
                    navigator.clipboard?.writeText(google.serviceAccountEmail ?? "");
                    setCopied(true);
                  }}
                >
                  {google.serviceAccountEmail}
                </button>{" "}
                {copied && <span className="text-teal-700">copied</span>} as <b>Editor</b>.
              </li>
              <li>
                Paste the sheet&apos;s link below. It must be a Google Sheet — if you opened an .xlsx from Drive, use <b>File → Save as Google Sheets</b> first.
                Your Bookings and Items are copied in if the sheet doesn&apos;t have them yet.
              </li>
            </ol>
            <div className="flex gap-2">
              <input className="input" placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button className="btn-dark whitespace-nowrap" disabled={busy || !url.trim()}>{busy ? "Connecting…" : "Connect"}</button>
            </div>
          </form>
        )}
        {error && !google.error && <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
      </div>
    </section>
  );
}
