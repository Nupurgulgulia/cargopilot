"use client";
import { useRef, useState } from "react";
import { runCompliance } from "@/lib/compliance/rules";
import { RULEBOOK } from "@/lib/constants";
import { isoToDisplay } from "@/lib/format";
import { labelBlockers } from "@/lib/labels";
import type { BookingPayload } from "@/lib/server/payload";
import type { RuleResult, RuleStatus, Suggestion } from "@/lib/types";
import { CarrierMatchmaker } from "./CarrierMatchmaker";
import { Confirmation } from "./Confirmation";
import { DocumentsPanel } from "./DocumentsPanel";
import { HsSuggest } from "./HsSuggest";
import { Calc, Check, Download, Truck } from "./icons";
import { gsap, reducedMotion, useGSAP } from "./motion/gsap";
import { DepartureBoard } from "./motion/primitives";
import { READINESS_META, SeverityTag, STATUS_META, StatusIcon } from "./status";

export type Action =
  | { type: "apply"; path: string; value: unknown; ruleId?: string; suggested?: boolean }
  | { type: "keep"; key: string; ruleId: string; reason: string }
  | { type: "unkeep"; key: string; ruleId: string }
  | { type: "confirm" }
  | { type: "email"; to: string; replyTo: string; note?: string; attachInvoice?: boolean; buyerCopy?: boolean; buyerEmail?: string }
  | { type: "approve"; approverName: string };

export type RunAction = (a: Action) => Promise<string | null>;

const WORST: RuleStatus[] = ["fail", "review", "not_evaluable", "pass"];
// Three-letter code for the boarding-pass route (LEE, ROT…).
const code = (city: string | null) => (city ? city.slice(0, 3).toUpperCase() : "···");
const LAMP = { grounded: "text-red-500", attention: "text-amber-500", cleared: "text-emerald-500" } as const;
const BOARD = { grounded: "text-red-700", attention: "text-amber-700", cleared: "text-emerald-700" } as const;
const BAR: Record<RuleStatus, string> = { pass: "bg-emerald-500", fail: "bg-red-500", review: "bg-amber-500", not_evaluable: "bg-slate-300" };

/** Invoice, Compliance and Labels status after confirmation; each links to its section. */
function DocumentStatuses({ data }: { data: BookingPayload }) {
  const c = runCompliance(data.view);
  const labels = labelBlockers(data.view);
  const inv = data.invoice.state;
  const chips: [string, string, string, string][] = [
    ["Invoice", inv === "approved" ? "Approved" : inv === "out_of_date" ? "Out of date" : "Not approved", inv === "approved" ? "ok" : inv === "out_of_date" ? "bad" : "wait", "#invoice"],
    ["Compliance", c.red ? `${c.red} critical` : c.amber ? `${c.amber} to review` : "No open issues", c.red ? "bad" : c.amber ? "warn" : "ok", "#compliance"],
    ["Labels", labels.length ? "Blocked" : "Ready to print", labels.length ? "bad" : "ok", "#labels"],
  ];
  const tone = { ok: "bg-emerald-500 text-white", warn: "bg-amber-400 text-[#3d2a00]", bad: "bg-red-500 text-white", wait: "bg-slate-200 text-slate-800" } as Record<string, string>;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] px-5 py-2.5 text-xs">
      {chips.map(([k, v, t, href]) => (
        <a key={k} href={href} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold transition-opacity hover:opacity-85 ${tone[t]}`}>
          {k}: {v}
        </a>
      ))}
    </div>
  );
}

/** Ring showing how many of the ten rules pass. */
function ChecksRing({ passed }: { passed: number }) {
  const ref = useRef<SVGCircleElement>(null);
  const C = 2 * Math.PI * 22;
  useGSAP(() => {
    if (!ref.current) return;
    const to = C * (1 - passed / 10);
    if (reducedMotion()) gsap.set(ref.current, { strokeDashoffset: to });
    else gsap.to(ref.current, { strokeDashoffset: to, duration: 1.1, ease: "manifest" });
  }, { dependencies: [passed] });
  return (
    <div className="relative h-14 w-14" title={`${passed} of 10 rules pass`}>
      <svg viewBox="0 0 52 52" className="h-full w-full -rotate-90">
        <circle cx="26" cy="26" r="22" fill="none" stroke="var(--n-200)" strokeWidth="4" />
        <circle ref={ref} cx="26" cy="26" r="22" fill="none" stroke="var(--color-signal)" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="num text-sm text-slate-900">{passed}</span>
        <span className="font-mono text-[9px] text-slate-500">/10</span>
      </div>
    </div>
  );
}

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
  const passedRules = RULEBOOK.filter((r) => ruleStatus(r.id) === "pass").length;
  const leg = view.carriers.selected ?? view.carriers.recommended;
  const carrierDays = leg ? `${leg.carrier.transitDays} days · ${leg.carrier.carrier}` : "Road freight";
  const statusKey = RULEBOOK.map((r) => ruleStatus(r.id)).join();

  // Pre-flight sequence: tick each check in order whenever any result changes; new issue cards slide in.
  const deck = useRef<HTMLElement>(null);
  const issues = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (reducedMotion() || !deck.current) return;
      const q = gsap.utils.selector(deck.current);
      gsap.timeline()
        .fromTo(q("[data-check]"), { opacity: 0.25, y: 4 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.06, ease: "power2.out" })
        .fromTo(q("[data-check-bar]"), { scaleX: 0 }, { scaleX: 1, transformOrigin: "left", duration: 0.3, stagger: 0.06, ease: "power2.out" }, 0);
    },
    { dependencies: [statusKey] },
  );
  useGSAP(
    () => {
      if (reducedMotion() || !issues.current) return;
      gsap.fromTo(issues.current.querySelectorAll("[data-issue]"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.05, ease: "manifest", clearProps: "transform" });
    },
    { dependencies: [open.map((r) => r.key).join()] },
  );

  return (
    <div className="space-y-4">
      {/* Status hero: a departure board for this booking */}
      <section ref={deck} id="flightdeck" data-tour="flight-deck" className="ticket card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="label-xs">
              Flight Deck · {b.bookingId ?? "New booking"}{b.originCity && b.destinationCity ? ` · ${b.originCity} → ${b.destinationCity}` : ""}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className={`live-dot h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot} ${LAMP[view.readiness]}`} />
              <DepartureBoard text={meta.board} className={`font-mono text-[22px] font-semibold tracking-[0.06em] sm:text-[26px] ${BOARD[view.readiness]}`} />
            </div>
            <div className="mt-1.5 text-sm text-slate-500">{meta.sub}</div>
          </div>
          <div className="flex items-center gap-4">
            <ChecksRing passed={passedRules} />
            {!compact && (
              <a href={`/api/report?booking=${data.id}`} className="btn-ghost text-xs">
                <Download className="h-4 w-4" /> Report
              </a>
            )}
          </div>
        </div>
        {/* Boarding-pass route: origin code, dashed flight arc, destination code */}
        <div className="flex items-center gap-4 px-5 pb-5">
          <div className="min-w-0">
            <div className="text-2xl font-bold tracking-tight text-slate-900">{code(b.originCity)}</div>
            <div className="truncate text-xs text-slate-500">{b.originCity ?? "Origin"}</div>
          </div>
          <div className="relative flex-1">
            <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
              <path d="M4 34 Q100 -14 196 34" fill="none" stroke="var(--n-300)" strokeWidth="1.5" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1 rounded-full bg-[var(--color-signal)] p-1.5 text-white">
              <Truck className="h-3.5 w-3.5" />
            </span>
            <div className="absolute inset-x-0 bottom-0 text-center text-[11px] text-slate-500">{carrierDays}</div>
          </div>
          <div className="min-w-0 text-right">
            <div className="text-2xl font-bold tracking-tight text-slate-900">{code(b.destinationCity)}</div>
            <div className="truncate text-xs text-slate-500">{b.destinationCity ?? "Destination"}</div>
          </div>
        </div>
        <div className="perforation mx-0" />
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[13px] font-medium text-slate-700">
          <span>{view.summary.headline}</span>
          {b.sellerConfirmedAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-semibold text-white">
              <Check className="h-3.5 w-3.5" /> Confirmed by you
            </span>
          )}
        </div>
        {b.sellerConfirmedAt && <DocumentStatuses data={data} />}
        <ol className="grid grid-cols-5 border-t border-[var(--color-line)] sm:grid-cols-10" aria-label="Pre-flight checklist">
          {RULEBOOK.map((r) => {
            const s = ruleStatus(r.id);
            return (
              <li key={r.id} data-check title={`${r.id} ${r.rule}: ${STATUS_META[s].label}`} className="relative flex flex-col items-center gap-1 border-[var(--color-line)] py-3 [&:not(:last-child)]:border-r">
                <span data-check-bar className={`absolute inset-x-0 top-0 h-[2px] ${BAR[s]}`} />
                <StatusIcon status={s} severity={r.severity} />
                <span className="font-mono text-[10.5px] text-slate-700">{r.id}</span>
                <span className="hidden text-center text-[10px] leading-tight text-slate-500 sm:block">{r.short}</span>
              </li>
            );
          })}
        </ol>
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

      <div ref={issues} className="space-y-4">
      {groups.map((g) =>
        g.items.length ? (
          <section key={g.title} data-tour={g.title === "Waiting on details" ? undefined : "issue"} className="space-y-2">
            <div className="flex items-baseline gap-2 px-1">
              <h3 className="text-sm font-semibold text-slate-900">{g.title} ({g.items.length})</h3>
              <span className="text-xs text-slate-500">{g.hint}</span>
            </div>
            {g.items.map((r) => (
              <IssueCard key={r.key} r={r} run={run} compact={compact} description={r.itemIndex != null ? view.items[r.itemIndex]?.description ?? null : null} />
            ))}
          </section>
        ) : null,
      )}
      </div>

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
      {!compact && <DocumentsPanel data={data} run={run} />}

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
  if (typeof v === "object") {
    const o = v as { description?: string; sku?: string; company?: string; street?: string; postcode?: string };
    if ("street" in o || "company" in o) return [o.company, o.street, o.postcode].filter(Boolean).join(", ") || "address";
    return o.description ?? o.sku ?? "item";
  }
  return String(v);
}

export function IssueCard({ r, run, compact, description }: { r: RuleResult; run: RunAction; compact: boolean; description: string | null }) {
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

  const rail = r.status === "fail" && r.severity === "Red" ? "bg-red-600" : r.status === "not_evaluable" ? "bg-slate-300" : "bg-amber-500";
  const tone =
    r.status === "fail" && r.severity === "Red" ? "border-red-200" : r.status === "not_evaluable" ? "border-slate-200" : "border-amber-200";

  return (
    <article data-issue className={`card relative overflow-hidden rounded-2xl border ${tone} p-4 pl-5`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${rail}`} />
      <div className="flex flex-wrap items-center gap-2">
        <StatusIcon status={r.status} severity={r.severity} />
        <span className="num text-xs text-slate-500">{r.ruleId}</span>
        <span className="font-semibold text-slate-900">{r.title}</span>
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
      {r.ruleId === "R-01" && r.itemIndex != null && !r.keptReason && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <HsSuggest
            description={description}
            onPick={(code) => run({ type: "apply", path: `items.${r.itemIndex}.hsCode`, value: code, ruleId: "R-01", suggested: true })}
          />
        </div>
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
