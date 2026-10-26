"use client";
import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { RULE_BY_ID } from "@/lib/constants";
import { gbp0 } from "@/lib/format";
import type { loadUpload } from "@/lib/server/uploads";
import type { Readiness } from "@/lib/types";
import { Download } from "./icons";
import { READINESS_META, ReadinessBadge } from "./status";
import { SheetSyncBar } from "./WorkbookSync";
import { Flip, gsap, reducedMotion } from "./motion/gsap";
import { NumberTicker, Reveal } from "./motion/primitives";

type Data = NonNullable<Awaited<ReturnType<typeof loadUpload>>>;
type Filter = "all" | Readiness;

export function AuditResults({ data }: { data: Data }) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(() => {
    const c = { grounded: 0, attention: 0, cleared: 0 };
    for (const b of data.bookings) c[b.readiness]++;
    return c;
  }, [data]);
  const topRules = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of data.bookings) for (const r of b.failedRules) m.set(r.ruleId, (m.get(r.ruleId) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [data]);
  const rows = data.bookings.filter((b) => filter === "all" || b.readiness === filter);

  // Rows glide to their new places when the filter changes (GSAP Flip).
  const body = useRef<HTMLTableSectionElement>(null);
  const flipState = useRef<Flip.FlipState | null>(null);
  const pick = (f: Filter) => {
    if (body.current && !reducedMotion()) flipState.current = Flip.getState(body.current.querySelectorAll("[data-row]"));
    setFilter(f);
  };
  useLayoutEffect(() => {
    if (!flipState.current) return;
    Flip.from(flipState.current, {
      duration: 0.5, ease: "manifest", absolute: false,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.03 }),
    });
    flipState.current = null;
  }, [filter]);
  const maxRule = topRules[0]?.[1] ?? 1;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Workbook audit · <span className="font-medium normal-case tracking-normal text-slate-500">{new Date(data.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span></div>
          <h1 className="mt-1 break-all text-2xl font-bold tracking-tight text-slate-900">{data.fileName}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/report?upload=${data.id}`} className="btn-ghost" title="Summary of every issue and carrier recommendation, as a spreadsheet">
            <Download className="h-4 w-4" /> Audit report
          </a>
          <a href={`/api/uploads/${data.id}/workbook`} className="btn-primary" title="Your original sheets untouched, plus CargoPilot Changes (grouped by Booking ID) and corrected Bookings & Items with changes highlighted">
            <Download className="h-4 w-4" /> Updated workbook
          </a>
        </div>
      </div>

      <SheetSyncBar uploadId={data.id} google={data.google} />

      <Reveal className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bookings checked" value={data.bookings.length} />
        {(["grounded", "attention", "cleared"] as const).map((r) => (
          <button data-reveal key={r} onClick={() => pick(filter === r ? "all" : r)} aria-pressed={filter === r} className={`card spotlight p-4 text-left transition ${filter === r ? "border-teal-500 ring-1 ring-teal-500" : "hover:border-slate-400"}`}>
            <ReadinessBadge r={r} />
            <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900"><NumberTicker value={counts[r]} className="font-sans" /></div>
            <div className="text-xs text-slate-500">{READINESS_META[r].sub}</div>
          </button>
        ))}
      </Reveal>

      {(data.importIssues.length > 0 || topRules.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.importIssues.length > 0 && (
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-slate-900">File notes</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {data.importIssues.map((i, k) => (
                  <li key={k} className={i.level === "error" ? "text-red-800" : i.level === "warning" ? "text-amber-900" : "text-slate-600"}>• {i.message}</li>
                ))}
              </ul>
            </div>
          )}
          {topRules.length > 0 && (
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-slate-900">Most common problems</h2>
              <ul className="mt-3 space-y-2.5 text-sm text-slate-700">
                {topRules.map(([id, n]) => (
                  <li key={id}>
                    <div className="flex justify-between gap-2"><span><span className="num text-xs text-slate-500">{id}</span> {RULE_BY_ID[id].short}</span><span className="num text-xs">{n} booking{n > 1 ? "s" : ""}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className={`h-full rounded-full ${RULE_BY_ID[id].severity === "Red" ? "bg-red-600" : "bg-amber-500"}`} style={{ width: `${(n / maxRule) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-line)] px-4 py-2.5 text-sm">
          <span className="text-slate-500">Show:</span>
          {(["all", "grounded", "attention", "cleared"] as const).map((f) => (
            <button key={f} onClick={() => pick(f)} aria-pressed={filter === f} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === f ? "bg-[var(--color-signal)] text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>
              {f === "all" ? `All (${data.bookings.length})` : `${READINESS_META[f].label} (${counts[f]})`}
            </button>
          ))}
        </div>
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 font-mono text-[10.5px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Booking</th>
              <th className="px-2 font-medium">Route</th>
              <th className="px-2 font-medium">Status</th>
              <th className="px-2 font-medium">Rules broken</th>
              <th className="px-2 font-medium">Carrier for priority</th>
              <th className="px-2" />
            </tr>
          </thead>
          <tbody ref={body}>
            {rows.map((b) => (
              <tr key={b.id} data-row data-flip-id={b.id} className="group border-t border-[var(--color-line)] align-top transition-colors hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="num font-medium text-slate-900">{b.bookingRef}</div>
                  <div className="text-xs text-slate-500">{b.seller}</div>
                </td>
                <td className="px-2 py-3 font-mono text-[12px] uppercase text-slate-700">{b.route}</td>
                <td className="px-2 py-3">
                  <ReadinessBadge r={b.readiness} />
                  <div className="mt-1 text-xs text-slate-500">{b.headline}</div>
                </td>
                <td className="px-2 py-3">
                  <div className="flex max-w-xs flex-wrap gap-1">
                    {b.failedRules.length === 0 && b.dataIssues === 0 && <span className="text-xs text-emerald-700">None</span>}
                    {b.failedRules.map((r) => (
                      <span
                        key={r.ruleId}
                        title={RULE_BY_ID[r.ruleId].rule}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${r.severity === "Red" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}
                      >
                        {r.severity === "Red" ? "■" : r.severity === "Amber" ? "▲" : "?"} {r.ruleId} {RULE_BY_ID[r.ruleId].short}
                      </span>
                    ))}
                    {b.dataIssues > 0 && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">{b.dataIssues} data issue{b.dataIssues > 1 ? "s" : ""}</span>}
                  </div>
                </td>
                <td className="px-2 py-3 text-slate-700">
                  <div className="text-xs text-slate-500">{b.priority}</div>
                  {b.carrier ? <>{b.carrier}{b.carrierCost != null && <span className="text-slate-500"> · {gbp0(b.carrierCost)}</span>}</> : <span className="text-xs text-slate-500">No eligible carrier</span>}
                </td>
                <td className="px-2 py-3 text-right">
                  <Link href={`/booking/${b.id}`} className="btn-ghost whitespace-nowrap text-xs group-hover:border-teal-500">Open Flight Deck <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span></Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No bookings in this group.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div data-reveal className="card p-4">
      <div className="label-xs">{label}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900"><NumberTicker value={value} className="font-sans" /></div>
    </div>
  );
}
