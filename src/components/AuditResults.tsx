"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { RULE_BY_ID } from "@/lib/constants";
import { gbp0 } from "@/lib/format";
import type { loadUpload } from "@/lib/server/uploads";
import type { Readiness } from "@/lib/types";
import { Download } from "./icons";
import { READINESS_META, ReadinessBadge } from "./status";
import { WorkbookSync } from "./WorkbookSync";

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

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">Batch audit · {new Date(data.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{data.fileName}</h1>
        </div>
        <a href={`/api/report?upload=${data.id}`} className="btn-ghost"><Download className="h-4 w-4" /> Download audit report (.xlsx)</a>
      </div>

      <WorkbookSync uploadId={data.id} google={data.google} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bookings checked" value={data.bookings.length} />
        {(["grounded", "attention", "cleared"] as const).map((r) => (
          <button key={r} onClick={() => setFilter(filter === r ? "all" : r)} className={`card p-4 text-left transition ${filter === r ? "ring-2 ring-teal-600" : "hover:border-slate-300"}`}>
            <ReadinessBadge r={r} />
            <div className="mt-2 text-3xl font-semibold text-slate-900">{counts[r]}</div>
            <div className="text-xs text-slate-500">{READINESS_META[r].sub}</div>
          </button>
        ))}
      </div>

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
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {topRules.map(([id, n]) => (
                  <li key={id}><b>{id}</b> {RULE_BY_ID[id].short} — {n} booking{n > 1 ? "s" : ""}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-sm">
          <span className="text-slate-500">Show:</span>
          {(["all", "grounded", "attention", "cleared"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${filter === f ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {f === "all" ? `All (${data.bookings.length})` : `${READINESS_META[f].label} (${counts[f]})`}
            </button>
          ))}
        </div>
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Booking</th>
              <th className="px-2 font-medium">Route</th>
              <th className="px-2 font-medium">Status</th>
              <th className="px-2 font-medium">Rules broken</th>
              <th className="px-2 font-medium">Carrier for priority</th>
              <th className="px-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{b.bookingRef}</div>
                  <div className="text-xs text-slate-500">{b.seller}</div>
                </td>
                <td className="px-2 py-3 text-slate-700">{b.route}</td>
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
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${r.severity === "Red" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}
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
                  <Link href={`/booking/${b.id}`} className="btn-ghost whitespace-nowrap text-xs">Open Flight Deck</Link>
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
    <div className="card p-4">
      <div className="label-xs">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
