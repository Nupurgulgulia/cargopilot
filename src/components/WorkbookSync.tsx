"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { loadUpload } from "@/lib/server/uploads";
import { External, Info } from "./icons";

type Google = NonNullable<Awaited<ReturnType<typeof loadUpload>>>["google"];

const syncedAt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// One slim line for the live Google Sheet: status + actions, with the connect form only when asked for.
export function SheetSyncBar({ uploadId, google }: { uploadId: string; google: Google }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<null | "connect" | "sync" | "disconnect">(null);
  const [error, setError] = useState<string | null>(null);

  if (!google.enabled) return null;

  async function call(kind: "connect" | "sync" | "disconnect") {
    setBusy(kind);
    setError(null);
    const res = await fetch(`/api/uploads/${uploadId}/google`, {
      method: kind === "connect" ? "POST" : kind === "sync" ? "PUT" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: kind === "connect" ? JSON.stringify({ sheetUrl: url.trim() }) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setError(json.error ?? "Something went wrong.");
    else {
      setOpen(false);
      router.refresh();
    }
  }

  const connected = Boolean(google.sheetId);
  const problem = error ?? google.error;
  const dot = !connected ? "bg-slate-300" : problem ? "bg-red-500" : "bg-emerald-500";

  return (
    <div className="card px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
        <span className="font-medium text-slate-900">Google Sheet</span>
        <SheetHelp email={google.serviceAccountEmail ?? ""} />
        <span className="text-slate-500">
          {!connected
            ? "Keep a live copy of these results in Google Sheets"
            : problem
              ? "Sync paused"
              : google.syncedAt
                ? `Live · synced ${syncedAt(google.syncedAt)}`
                : "Live · first sync pending"}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {connected ? (
            <>
              <a
                href={`https://docs.google.com/spreadsheets/d/${google.sheetId}/edit`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium text-teal-700 hover:bg-teal-50"
              >
                Open sheet <External className="h-3.5 w-3.5" />
              </a>
              <button className="rounded-md px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900" disabled={!!busy} onClick={() => call("sync")}>
                {busy === "sync" ? "Syncing…" : "Sync now"}
              </button>
              <button className="rounded-md px-2.5 py-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" disabled={!!busy} onClick={() => call("disconnect")}>
                {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
              </button>
            </>
          ) : (
            <button className="btn-ghost py-1.5 text-xs" onClick={() => setOpen((o) => !o)}>
              {open ? "Cancel" : "Connect"}
            </button>
          )}
        </div>
      </div>

      {open && !connected && (
        <form
          className="mt-3 border-t border-slate-100 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) call("connect");
          }}
        >
          <div className="flex gap-2">
            <input autoFocus className="input" placeholder="Paste your Google Sheet link" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="btn-dark whitespace-nowrap" disabled={!!busy || !url.trim()}>{busy === "connect" ? "Connecting…" : "Connect"}</button>
          </div>
        </form>
      )}

      {problem && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{problem}</p>}
    </div>
  );
}

// ⓘ next to "Google Sheet": setup steps on hover or click, so the bar itself stays clean.
function SheetHelp({ email }: { email: string }) {
  // Hover previews it; a click pins it open (so the click never fights the hover).
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || pinned;
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) {
        setPinned(false);
        setHover(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative -ml-1.5 inline-flex" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        aria-label="How to connect a Google Sheet"
        aria-expanded={open}
        onClick={() => setPinned((p) => !p || hover)}
        className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-teal-600"
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <span role="dialog" className="absolute left-0 top-full z-20 pt-2">
          <span className="block w-80 rounded-xl border border-slate-200 bg-white p-4 text-left text-xs leading-relaxed text-slate-600 shadow-xl shadow-slate-900/10">
            <span className="block text-sm font-semibold text-slate-900">Connect a Google Sheet</span>
            <span className="mt-2 block">
              <b className="text-slate-800">1.</b> In Google Sheets, click <b>Share</b> and add this email as <b>Editor</b>:
            </span>
            <span className="mt-1.5 flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-800" title={email}>{email}</span>
              <button
                type="button"
                className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-slate-200 hover:bg-teal-50"
                onClick={() => {
                  navigator.clipboard?.writeText(email);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </span>
            <span className="mt-2 block">
              <b className="text-slate-800">2.</b> Paste the sheet&apos;s link and click <b>Connect</b>.
            </span>
            <span className="mt-3 block border-t border-slate-100 pt-2 text-slate-500">
              Excel file in Drive? Use <b>File → Save as Google Sheets</b> first. Your own tabs are never changed. CargoPilot only updates its own three tabs.
            </span>
          </span>
        </span>
      )}
    </span>
  );
}
