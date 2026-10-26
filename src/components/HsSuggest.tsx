"use client";
import { useEffect, useState } from "react";
import type { HsSuggestion } from "@/lib/server/hsSuggest";
import { Check } from "./icons";

// "Suggest HS code": shows up to 3 real HS 2022 codes for the item; nothing is applied until the seller picks one.
export function HsSuggest({
  description,
  current,
  onPick,
  compact = false,
  autoLoad = false,
}: {
  description: string | null;
  current?: string | null;
  onPick: (code: string) => Promise<string | null>;
  compact?: boolean;
  /** Fetch straight away instead of showing a "Suggest HS code" button first. */
  autoLoad?: boolean;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done">(autoLoad ? "loading" : "idle");
  const [items, setItems] = useState<HsSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    if (autoLoad && description?.trim()) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, description]);

  if (!description?.trim()) return null;

  async function load() {
    setState("loading");
    setError(null);
    const res = await fetch("/api/hs-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error ?? "Couldn't get suggestions.");
    setItems(json.suggestions ?? []);
    setState("done");
  }

  if (state === "idle") {
    return (
      <button type="button" onClick={load} className={`font-medium text-teal-700 hover:underline ${compact ? "text-xs" : "text-sm"}`}>
        Suggest HS code
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {state === "loading" && <p className="text-xs text-slate-500">Finding matching HS codes for “{description}”…</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
      {state === "done" && !error && items.length === 0 && (
        <p className="text-xs text-slate-500">No confident match for “{description}”. Try a more specific description (material and use), or enter the code yourself.</p>
      )}
      {items.length > 0 && (
        <>
          <div className="label-xs">Suggested HS codes</div>
          <ul className="space-y-1.5">
            {items.map((s, i) => (
              <li key={s.code} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900">{s.code}</span>
                    {i === 0 && <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800">Best match</span>}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600" title={s.description}>{s.description}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{s.reason}</p>
                </div>
                {current === s.code ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" /> In use</span>
                ) : (
                  <button
                    type="button"
                    disabled={picking !== null}
                    className="btn-primary shrink-0 px-2.5 py-1 text-xs"
                    onClick={async () => {
                      setPicking(s.code);
                      const err = await onPick(s.code);
                      setPicking(null);
                      if (err) setError(err);
                    }}
                  >
                    {picking === s.code ? "Using…" : "Use"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-400">From the official HS 2022 list. Please check it matches your product before shipping.</p>
        </>
      )}
    </div>
  );
}
