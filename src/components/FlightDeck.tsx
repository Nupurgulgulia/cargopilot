"use client";
import { useState } from "react";
import { RULEBOOK } from "@/lib/constants";
import { isoToDisplay } from "@/lib/format";
import type { BookingPayload } from "@/lib/server/payload";
import type { RuleResult, RuleStatus, Suggestion } from "@/lib/types";
import { CarrierMatchmaker } from "./CarrierMatchmaker";
import { Confirmation } from "./Confirmation";
import { Calc, Check, Download } from "./icons";
import { READINESS_META, ReadinessIcon, SeverityTag, STATUS_META, StatusIcon } from "./status";

export type Action =
  | { type: "apply"; path: string; value: unknown; ruleId?: string; suggested?: boolean }
  | { type: "keep"; key: string; ruleId: string; reason: string }
  | { type: "unkeep"; key: string; ruleId: string }
  | { type: "confirm" };

export type RunAction = (a: Action) => Promise<string | null>;

const WORST: RuleStatus[] = ["fail", "review", "not_evaluable", "pass"];

export function FlightDeck({ data, run, compact = false }: { data: BookingPayload; run: RunAction; compact?: boolean }) {
  const { view } = data;
  const b = view.booking;
  const meta = READINESS_META[view.readiness];

  const ruleStatus = (id: string) => {
    const rs = view.results.filter((r) => r.ruleId === id);
    for (const s of WORST) if (rs.some((r) => r.status === s)) return s;
    return "pass" as RuleStatus;
  };

  const open = view.results.filter((r) => r.status !== "pass");
  const groups: { title: string; hint: string; items: RuleResult[] }[] = [
    { title: "Blocking dispatch", hint: "Must be fixed before the shipment can leave", items: open.filter((r) => r.status === "fail" && r.severity === "Red") },
    { title: "Needs your confirmation", hint: "Tell us whether these items contain restricted goods", items: open.filter((r) => r.status === "review") },
    { title: "Warnings", hint: "Fix them, or add a note explaining why they're fine", items: open.filter((r) => r.status === "fail" && r.severity === "Amber") },
    { title: "Waiting on details", hint: "These checks run once the details are added", items: open.filter((r) => r.status === "not_evaluable") },
  ];
  const passed = view.results.filter((r) => r.status === "pass");

  return (
    <div className="space-y-4">
      {/* Status hero */}
      <section className={`card overflow-hidden border-l-4 ${view.readiness === "grounded" ? "border-l-red-600" : view.readiness === "attention" ? "border-l-amber-500" : "border-l-emerald-600"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div>
            <div className="label-xs">Flight Deck · {b.bookingId ?? "New booking"}</div>
            <div className="mt-2 flex items-center gap-3">
              <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${meta.cls}`}>
                <ReadinessIcon r={view.readiness} />
              </span>
              <div>
                <div className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">{meta.label}</div>
                <div className="text-sm text-slate-600">{meta.sub}</div>
              </div>
            </div>
          </div>
          {!compact && (
            <a href={`/api/report?booking=${data.id}`} className="btn-ghost text-xs">
              <Download className="h-4 w-4" /> Download report
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-sm font-medium tabular-nums text-slate-700">
          <span>{view.summary.headline}</span>
          {b.sellerConfirmedAt && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              <Check className="h-3.5 w-3.5" /> Confirmed by you
            </span>
          )}
        </div>
        <div className="grid grid-cols-5 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-10">
          {RULEBOOK.map((r) => {
            const s = ruleStatus(r.id);
            return (
              <div key={r.id} title={`${r.id} ${r.rule}: ${STATUS_META[s].label}`} className="flex flex-col items-center gap-0.5 bg-white py-2">
                <StatusIcon status={s} severity={r.severity} />
                <span className="text-[10px] font-semibold text-slate-600">{r.id}</span>
                <span className={`hidden text-[9px] sm:block ${STATUS_META[s].cls}`}>{STATUS_META[s].label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {view.missing.length > 0 && !compact && (
        <section className="card p-4">
          <h3 className="text-sm font-semibold text-slate-900">Still needed ({view.missing.length})</h3>
          <ul className="mt-2 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
            {view.missing.map((m) => (
              <li key={m.path} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />{m.label}</li>
            ))}
          </ul>
        </section>
      )}

      {view.dataIssues.length > 0 && (
        <section className="card border-slate-300 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Data quality</h3>
          <p className="text-xs text-slate-500">Values in the booking that couldn&apos;t be read or don&apos;t make sense.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {view.dataIssues.map((d, i) => (
              <li key={i} className={d.level === "error" ? "text-red-800" : "text-amber-900"}>• {d.message}</li>
            ))}
          </ul>
        </section>
      )}

      {groups.map((g) =>
        g.items.length ? (
          <section key={g.title} className="space-y-2">
            <div className="flex items-baseline gap-2 px-1">
              <h3 className="text-sm font-semibold text-slate-900">{g.title} ({g.items.length})</h3>
              <span className="text-xs text-slate-500">{g.hint}</span>
            </div>
            {g.items.map((r) => <IssueCard key={r.key} r={r} run={run} compact={compact} />)}
          </section>
        ) : null,
      )}

      {passed.length > 0 && (
        <details className="card group p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Passed checks ({passed.length}) · show the working</summary>
          <ul className="mt-3 space-y-2">
            {passed.map((r) => (
              <li key={r.key} className="flex gap-2 text-sm">
                <StatusIcon status="pass" className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <span className="font-medium">{r.ruleId} {r.title}{r.itemLabel ? ` · ${r.itemLabel}` : ""}:</span>{" "}
                  <span className="text-slate-700">{r.explanation}</span>
                  {r.calculation && <div className="font-mono text-xs text-slate-500">{r.calculation}</div>}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <CarrierMatchmaker view={view} run={run} />
      <Confirmation data={data} run={run} />

      {data.history.length > 0 && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Audit trail ({data.history.length})</summary>
          <p className="mt-1 text-xs text-slate-500">Every change is saved with its original value. Nothing is overwritten without your approval.</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {data.history.map((h) => (
              <li key={h.id} className="text-slate-700">
                <span className="text-xs text-slate-400">{new Date(h.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span>{" "}
                {h.action === "kept_original" ? (
                  <>Kept original for <b>{h.rule_id}</b>: “{h.reason}”</>
                ) : (
                  <>
                    <b>{h.field_path}</b>: {fmt(h.old_value)} → {fmt(h.new_value)}{" "}
                    <span className="text-xs text-slate-500">({h.action === "accepted_fix" ? `accepted fix${h.rule_id ? ` for ${h.rule_id}` : ""}` : h.action === "chat_update" ? "changed in chat" : "edited"})</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function fmt(v: unknown) {
  if (v == null) return "blank";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return isoToDisplay(v);
  if (typeof v === "object") return (v as { description?: string; sku?: string }).description ?? (v as { sku?: string }).sku ?? "item";
  return String(v);
}

function IssueCard({ r, run, compact }: { r: RuleResult; run: RunAction; compact: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [keeping, setKeeping] = useState(false);
  const [reason, setReason] = useState("");

  const go = async (a: Action) => {
    setBusy(true);
    setErr(null);
    const e = await run(a);
    setBusy(false);
    if (e) setErr(e);
    else setKeeping(false);
  };

  const tone =
    r.status === "fail" && r.severity === "Red" ? "border-red-200" : r.status === "not_evaluable" ? "border-slate-200" : "border-amber-200";

  return (
    <article className={`card border ${tone} p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusIcon status={r.status} severity={r.severity} />
        <span className="font-semibold text-slate-900">{r.ruleId} · {r.title}</span>
        {r.status !== "not_evaluable" && <SeverityTag s={r.severity} />}
        {r.itemLabel && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{r.itemLabel}</span>}
      </div>
      <p className="mt-2 text-sm text-slate-800">{r.explanation}</p>

      {r.calculation && (
        <div className="mt-2 flex gap-2 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
          <Calc className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>{r.calculation}</span>
        </div>
      )}
      {(r.observed || r.expected) && r.status === "fail" && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {r.observed && <span className="rounded-md bg-red-50 px-2 py-1 text-red-900">Found: <b>{r.observed}</b></span>}
          {r.expected && <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-900">Expected: <b>{r.expected}</b></span>}
        </div>
      )}

      {r.keptReason ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm">
          <div className="text-slate-800"><b>Kept as is.</b> Your reason: “{r.keptReason}”</div>
          {r.severity === "Red" && <div className="mt-1 text-xs text-red-700">Red issues still block dispatch under the rulebook, even when explained.</div>}
          <button className="mt-1 text-xs font-medium text-teal-700 hover:underline" disabled={busy} onClick={() => go({ type: "unkeep", key: r.key, ruleId: r.ruleId })}>
            Undo
          </button>
        </div>
      ) : (
        (r.suggestions.length > 0 || r.status === "fail") && (
          <div className="mt-3 space-y-2">
            {r.suggestions.length > 0 && <div className="label-xs">{r.status === "review" ? "Your answer" : "Suggested fix"}</div>}
            <div className="flex flex-wrap gap-2">
              {r.suggestions.filter((s) => s.kind === "set").map((s) => (
                <button key={s.label} className="btn-primary text-xs" disabled={busy} onClick={() => go({ type: "apply", path: s.path, value: (s as { value: unknown }).value, ruleId: r.ruleId, suggested: true })}>
                  {s.label}
                </button>
              ))}
            </div>
            {r.suggestions.filter((s) => s.kind === "input").map((s) => (
              <InputFix key={s.label} s={s as Extract<Suggestion, { kind: "input" }>} busy={busy} onSave={(v) => go({ type: "apply", path: s.path, value: v, ruleId: r.ruleId })} />
            ))}
            {r.status === "fail" && !compact && (
              keeping ? (
                <div className="space-y-2 rounded-lg border border-slate-200 p-2.5">
                  <label className="text-xs font-medium text-slate-700">Why is the original value correct?</label>
                  <textarea className="input min-h-16" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Declared value includes a separately invoiced discount" />
                  <div className="flex gap-2">
                    <button className="btn-dark text-xs" disabled={busy || reason.trim().length < 3} onClick={() => go({ type: "keep", key: r.key, ruleId: r.ruleId, reason })}>Keep & record reason</button>
                    <button className="btn-ghost text-xs" onClick={() => setKeeping(false)}>Cancel</button>
                  </div>
                  {r.severity === "Red" && <p className="text-xs text-red-700">Note: Red issues still block dispatch even when kept.</p>}
                </div>
              ) : (
                <button className="text-xs font-medium text-slate-600 underline-offset-2 hover:underline" onClick={() => setKeeping(true)}>
                  Keep my value and add a note
                </button>
              )
            )}
          </div>
        )
      )}
      {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
    </article>
  );
}

function InputFix({ s, busy, onSave }: { s: Extract<Suggestion, { kind: "input" }>; busy: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onSave(v.trim());
      }}
    >
      <label className="w-full text-xs text-slate-600">{s.label}</label>
      {s.inputType === "select" ? (
        <select className="input max-w-56" value={v} onChange={(e) => setV(e.target.value)}>
          <option value="">Choose…</option>
          {s.options?.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input className="input max-w-56" type={s.inputType} step="any" value={v} onChange={(e) => setV(e.target.value)} />
      )}
      <button className="btn-dark text-xs" disabled={busy || !v.trim()}>Save</button>
    </form>
  );
}
