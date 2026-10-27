"use client";
import { useEffect, useMemo, useState } from "react";
import { DISPATCH_LABELS, EVIDENCE_TYPES, INCOTERMS_2020, NEEDS_VERIFIED_SOURCE, NOT_ADVICE, PACKAGE_TYPES } from "@/lib/compliance/config";
import { payerText, runCompliance } from "@/lib/compliance/rules";
import { gbp, isoToDisplay, num } from "@/lib/format";
import { formatBytes } from "@/lib/invoiceEmail";
import { buildLabels, LABEL_FORMATS, LABEL_NOTE, labelBlockers, type LabelFormat, type LabelSelection } from "@/lib/labels";
import type { BookingPayload } from "@/lib/server/payload";
import type { RuleResult } from "@/lib/types";
import { IssueCard, type RunAction } from "./FlightDeck";
import { Check, Download } from "./icons";
import { StatusIcon } from "./status";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });
const isDate = (path: string) => /(Date|On)$/.test(path);

/** One input that saves through the audit trail when it loses focus. */
function Field({ label, path, value, run, type = "text", options, wide, hint }: {
  label: string; path: string; value: unknown; run: RunAction; type?: "text" | "number" | "select" | "textarea" | "bool";
  options?: readonly string[] | { value: string; label: string }[]; wide?: boolean; hint?: string;
}) {
  const shown = value == null ? "" : typeof value === "boolean" ? (value ? "Yes" : "No") : isDate(path) && typeof value === "string" ? isoToDisplay(value) : String(value);
  const [v, setV] = useState(shown);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => setV(shown), [shown]);
  const save = async (next = v) => {
    if (next === shown) return;
    setSaving(true);
    setErr(await run({ type: "apply", path, value: next.trim() === "" ? null : next }));
    setSaving(false);
  };
  const opts = (options ?? []).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const cls = "input mt-1";
  return (
    <label className={`block text-xs font-medium text-slate-700 ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {type === "select" || type === "bool" ? (
        <select className={cls} value={v} disabled={saving} onChange={(e) => { setV(e.target.value); save(e.target.value); }}>
          <option value="">Choose…</option>
          {(type === "bool" ? [{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }] : opts).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea className={`${cls} min-h-16`} value={v} disabled={saving} onChange={(e) => setV(e.target.value)} onBlur={() => save()} />
      ) : (
        <input className={cls} value={v} disabled={saving} inputMode={type === "number" ? "decimal" : undefined} placeholder={isDate(path) ? "DD-MM-YYYY" : undefined}
          onChange={(e) => setV(e.target.value)} onBlur={() => save()} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }} />
      )}
      {hint && <span className="mt-0.5 block font-normal text-slate-500">{hint}</span>}
      {err && <span className="mt-0.5 block font-normal text-red-700">{err}</span>}
    </label>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function NotAdvice() {
  return <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">{NOT_ADVICE}</p>;
}

export function DocumentsPanel({ data, run }: { data: BookingPayload; run: RunAction }) {
  const view = data.view;
  const c = useMemo(() => runCompliance(view), [view]);
  const confirmed = Boolean(view.booking.sellerConfirmedAt);
  const started = Boolean(view.booking.invoice || view.booking.compliance || data.invoice.approval);
  if (!confirmed && !started) return null;
  return (
    <div className="space-y-4">
      {!confirmed && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The booking changed after you confirmed it. Confirm it again above before approving the invoice.
        </p>
      )}
      <InvoiceCard data={data} run={run} c={c} />
      <ComplianceCard data={data} run={run} c={c} />
      <LabelsCard data={data} run={run} />
    </div>
  );
}

// ---------------- Invoice ----------------
function InvoiceCard({ data, run, c }: { data: BookingPayload; run: RunAction; c: ReturnType<typeof runCompliance> }) {
  const m = c.invoice, d = m.data, b = data.view.booking;
  const st = data.invoice;
  const [approver, setApprover] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const d0 = c.results.filter((r) => /^D-0[1-4]$/.test(r.ruleId) && r.status === "fail");

  return (
    <section id="invoice" data-tour="invoice" className="paper card rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">Commercial invoice</h3>
          <p className="text-xs text-slate-500">Must go with the shipment. Prefilled from the booking; change anything that differs.</p>
        </div>
        <InvoiceBadge state={st.state} />
      </div>

      {st.state === "out_of_date" && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-800">Approval out of date: regenerate and approve again.</p>
      )}

      <div className="mt-4 space-y-3">
        <Group title="Invoice">
          <Field run={run} label="Invoice number" path="invoice.invoiceNumber" value={d.invoiceNumber} />
          <Field run={run} label="Invoice date" path="invoice.issueDate" value={d.issueDate} />
          <Field run={run} label="Proforma, PO or contract number" path="invoice.orderReference" value={d.orderReference} />
          <Field run={run} label="Its date" path="invoice.orderDate" value={d.orderDate} />
          <Field run={run} label="Payment method" path="invoice.paymentMethod" value={d.paymentMethod} hint="For example: bank transfer, 30 days" />
          <Field run={run} label="Buyer type" path="invoice.buyerType" value={d.buyerType} type="select" options={["B2B", "B2C"]} />
        </Group>
        <Group title="Seller / exporter">
          <Field run={run} label="Name" path="invoice.seller.name" value={d.seller?.name} />
          <Field run={run} label="GB EORI" path="invoice.exporterEori" value={d.exporterEori} hint="GB followed by 12 digits" />
          <Field run={run} label="Address" path="invoice.seller.address" value={d.seller?.address} wide />
          <Field run={run} label="Postcode" path="invoice.seller.postcode" value={d.seller?.postcode} />
          <Field run={run} label="Country" path="invoice.seller.country" value={d.seller?.country} />
          <Field run={run} label="Contact name" path="invoice.seller.contactName" value={d.seller?.contactName} />
          <Field run={run} label="Phone" path="invoice.seller.phone" value={d.seller?.phone} />
          <Field run={run} label="Email" path="invoice.seller.email" value={d.seller?.email} />
        </Group>
        <Group title="Buyer / consignee">
          <Field run={run} label="Name" path="invoice.buyer.name" value={d.buyer?.name} />
          <Field run={run} label="EU EORI" path="invoice.buyerEori" value={d.buyerEori} hint="UK and EU EORI numbers aren't recognised across the border" />
          <Field run={run} label="Address" path="invoice.buyer.address" value={d.buyer?.address} wide />
          <Field run={run} label="Postcode" path="invoice.buyer.postcode" value={d.buyer?.postcode} />
          <Field run={run} label="Country" path="invoice.buyer.country" value={d.buyer?.country} />
          <Field run={run} label="Contact name" path="invoice.buyer.contactName" value={d.buyer?.contactName} />
          <Field run={run} label="Phone" path="invoice.buyer.phone" value={d.buyer?.phone} />
          <Field run={run} label="Email" path="invoice.buyer.email" value={d.buyer?.email} />
        </Group>
        <Group title="Terms, price and packing">
          <Field run={run} label="Incoterm" path="invoice.incoterm" value={d.incoterm} type="select" options={INCOTERMS_2020} />
          <Field run={run} label="Named place" path="invoice.incotermPlace" value={d.incotermPlace} hint={`For example: ${b.destinationCity ?? "Berlin"}`} />
          <Field run={run} label="Currency" path="invoice.currency" value={d.currency} type="select" options={["GBP", "EUR"]} />
          {d.currency !== "GBP" && <Field run={run} label="Exchange rate (1 GBP = …)" path="invoice.exchangeRate" value={d.exchangeRate} type="number" />}
          {d.currency !== "GBP" && <Field run={run} label="Date the rate was fixed" path="invoice.rateFixedOn" value={d.rateFixedOn} />}
          <Field run={run} label="Discount (GBP)" path="invoice.discount" value={d.discount} type="number" />
          <Field run={run} label="Freight charge (GBP)" path="invoice.freightCharge" value={d.freightCharge} type="number" />
          <Field run={run} label="Insurance (GBP)" path="invoice.insuranceCharge" value={d.insuranceCharge} type="number" />
          <Field run={run} label="Package type" path="invoice.packageType" value={d.packageType} type="select" options={PACKAGE_TYPES} />
          <Field run={run} label="Who moves the goods out of the UK?" path="invoice.dispatchMode" value={d.dispatchMode ? DISPATCH_LABELS[d.dispatchMode] : null} type="select" options={Object.values(DISPATCH_LABELS)} wide />
          <Field run={run} label="Needs Chamber of Commerce certification" path="invoice.chamberCertification" value={d.chamberCertification} type="bool" hint="Some countries require it; check with your local Chamber." />
        </Group>
        {d.currency && d.currency !== "GBP" && (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
            If you haven&apos;t fixed your exchange rate, you haven&apos;t fixed your price. Agree the invoice currency and exchange-rate risk with the buyer; the rate and the date it was fixed are printed on the invoice.
          </p>
        )}
        <Group title="Statement of origin">
          <Field run={run} label="Approved statement of origin text" path="invoice.originStatement" value={d.originStatement} type="textarea" wide
            hint="Needed to claim zero tariff under the UK-EU Trade and Cooperation Agreement. Paste your approved wording; CargoPilot doesn't write it." />
        </Group>
      </div>

      {/* Totals */}
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        {[
          ["Goods total", m.goodsTotal != null ? gbp(m.goodsTotal) : "—"],
          ["Declared value (R-02)", m.declaredValue != null ? gbp(m.declaredValue) : "—"],
          ["Invoice total", m.invoiceTotal != null ? gbp(m.invoiceTotal) : "—"],
          ["Net weight", m.netWeightKg != null ? `${num(m.netWeightKg)} kg` : "—"],
          ["Gross weight", m.grossWeightKg != null ? `${num(m.grossWeightKg)} kg` : "—"],
          ["Packages", m.packages.count != null ? `${m.packages.count} × ${m.packages.type ?? "package"}` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <dt className="text-[11px] font-medium text-slate-500">{k}</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      {c.vatLine ? <p className="mt-2 text-xs text-emerald-800">The invoice will say: “{c.vatLine}”</p> : <p className="mt-2 text-xs text-slate-500">No zero-rated VAT line yet: it appears only once export evidence is logged (X-03).</p>}

      {d0.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="label-xs">To complete the invoice</div>
          {d0.map((r) => <IssueCard key={r.key} r={r} run={run} compact={false} description={null} />)}
        </div>
      )}

      {/* Preview and approval */}
      <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <a className="btn-ghost text-sm" href={`/api/bookings/${data.id}/invoice`} target="_blank" rel="noreferrer">Preview invoice (PDF)</a>
          {st.state !== "not_approved" && (
            <a className="btn-ghost text-sm" href={`/api/bookings/${data.id}/invoice?copy=approved&download=1`}><Download className="h-4 w-4" /> Approved PDF ({formatBytes(st.approval!.pdf_size)})</a>
          )}
        </div>
        {st.state === "approved" ? (
          <div role="status" className="mt-3 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="h-3.5 w-3.5" /></span>
            <div>
              <div className="font-semibold">Invoice approved on {when(st.approval!.approved_at)}</div>
              <p className="mt-0.5 text-emerald-800">Invoice {st.approval!.invoice_number}, approved by {st.approval!.approver_name} (name entered at approval). Any change to the invoice or booking puts this approval out of date.</p>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {c.approveBlockers.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-700">
                {c.approveBlockers.map((x) => <li key={x}>{x}</li>)}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <label className="block text-xs font-medium text-slate-700">
                Approver&apos;s full name
                <input className="input mt-1 w-64" value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Name of the person approving" />
              </label>
              <button
                className="btn-dark rounded-full px-5"
                disabled={busy || c.approveBlockers.length > 0 || approver.trim().length < 2}
                onClick={async () => { setBusy(true); setErr(await run({ type: "approve", approverName: approver.trim() })); setBusy(false); }}
              >
                <Check className="h-4 w-4" /> {busy ? "Approving…" : st.state === "out_of_date" ? "Regenerate and approve again" : "Approve invoice"}
              </button>
            </div>
            <p className="text-xs text-slate-500">Approval generates the final PDF once and stores it with a fingerprint (SHA-256). The emailed copy is always that exact file.</p>
            {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{err}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

function InvoiceBadge({ state }: { state: BookingPayload["invoice"]["state"] }) {
  const m = {
    approved: ["Approved", "border-emerald-200 bg-emerald-50 text-emerald-800"],
    out_of_date: ["Approval out of date", "border-red-200 bg-red-50 text-red-800"],
    not_approved: ["Not approved", "border-slate-200 bg-slate-50 text-slate-700"],
  }[state];
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${m[1]}`}>{m[0]}</span>;
}

// ---------------- Compliance ----------------
function ComplianceCard({ data, run, c }: { data: BookingPayload; run: RunAction; c: ReturnType<typeof runCompliance> }) {
  const b = data.view.booking, comp = b.compliance;
  const groups: [string, RegExp][] = [["UK export (pickup)", /^X-/], [`Import into ${b.destinationCountry ?? "the destination"}`, /^M-/], ["Documents", /^D-/]];
  const open = (r: RuleResult) => r.status === "fail" || (r.status === "not_evaluable" && r.suggestions.length > 0);
  return (
    <section id="compliance" data-tour="compliance" className="card rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">Tax and customs checks</h3>
          <p className="text-xs text-slate-500">UK export side and {b.destinationCountry ?? "destination"} import side. CargoPilot doesn&apos;t submit customs declarations or file VAT.</p>
        </div>
        <a className="btn-ghost text-sm" href={`/api/bookings/${data.id}/compliance-report`} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> Compliance report</a>
      </div>
      <div className="mt-3"><NotAdvice /></div>

      {/* Key facts */}
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <dt className="text-[11px] font-medium text-slate-500">Who pays import duty and VAT</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">{payerText(c.payer, c.invoice.data.incoterm)}</dd>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <dt className="text-[11px] font-medium text-slate-500">Import VAT (estimate, not a filing)</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">
            {c.estimates.vatEstimate != null ? `≈ ${gbp(c.estimates.vatEstimate)} at ${c.estimates.vatRate}%` : "Not available yet"}
          </dd>
          {c.estimates.vatSourceUrl && <a className="text-[11px] text-teal-700 underline" href={c.estimates.vatSourceUrl} target="_blank" rel="noreferrer">{c.estimates.vatSource}</a>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:col-span-2">
          <dt className="text-[11px] font-medium text-slate-500">UK VAT zero-rating evidence deadline</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">
            {c.zero.deadline
              ? `${isoToDisplay(c.zero.deadline)} · ${c.zero.evidenceLogged ? "evidence logged" : c.zero.daysLeft! >= 0 ? `${c.zero.daysLeft} days left` : `${-c.zero.daysLeft!} days overdue`}`
              : "Add the date the goods are sent or payment received"}
          </dd>
          <p className="text-[11px] text-slate-500">3 months from the time of sale (the earlier of goods sent or full payment). Keep evidence for 6 years; report export sales in Box 6.</p>
        </div>
      </dl>

      {/* Inputs */}
      <div className="mt-4 space-y-3">
        <Group title="Export declaration and VAT">
          <Field run={run} label="Export declaration reference" path="compliance.exportDeclarationRef" value={comp?.exportDeclarationRef} />
          <Field run={run} label="Or: agent or forwarder handling it" path="compliance.exportAgent" value={comp?.exportAgent} />
          <Field run={run} label="Date the goods are sent" path="compliance.goodsSentOn" value={comp?.goodsSentOn} hint={b.readyToShipDate ? `Planned collection: ${isoToDisplay(b.readyToShipDate)}` : undefined} />
          <Field run={run} label="Date full payment was received" path="compliance.paymentReceivedOn" value={comp?.paymentReceivedOn} />
          <Field run={run} label="Classification checked by" path="compliance.classificationCheckedBy" value={comp?.classificationCheckedBy} hint="Against the UK Online Trade Tariff and EU TARIC" />
          {b.destinationCountry === "Netherlands" && <Field run={run} label="Importer has an Article 23 licence" path="compliance.article23Licence" value={comp?.article23Licence} type="bool" />}
          {c.invoice.data.buyerType === "B2C" && (
            <>
              <Field run={run} label="EUR per 1 GBP" path="compliance.eurRate" value={comp?.eurRate} type="number" />
              <Field run={run} label="Date of that rate" path="compliance.eurRateDate" value={comp?.eurRateDate} />
              <Field run={run} label="IOSS number" path="compliance.iossNumber" value={comp?.iossNumber} />
            </>
          )}
        </Group>
        <EvidenceLog data={data} run={run} />
      </div>

      {/* Rules */}
      <div className="mt-4 space-y-4">
        {groups.map(([title, re]) => {
          const rs = c.rules.filter((r) => re.test(r.rule.id));
          const issues = rs.flatMap((r) => r.results.filter(open));
          const passed = rs.flatMap((r) => r.results.filter((x) => !open(x)));
          return (
            <div key={title} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900">{title}</h4>
                <div className="flex flex-wrap gap-1">
                  {rs.map((r) => (
                    <span key={r.rule.id} title={`${r.rule.id} ${r.rule.short}`} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10.5px] ${r.worst === "Red" ? "border-red-200 bg-red-50 text-red-800" : r.worst === "Amber" ? "border-amber-200 bg-amber-50 text-amber-900" : r.status === "pass" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                      {r.rule.id}
                    </span>
                  ))}
                </div>
              </div>
              {issues.map((r) => <IssueCard key={r.key} r={r} run={run} compact={false} description={null} />)}
              {passed.length > 0 && (
                <details className="rounded-2xl border border-slate-200 px-3.5 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">Passed or for information ({passed.length})</summary>
                  <ul className="mt-2 space-y-1.5">
                    {passed.map((r) => (
                      <li key={r.key} className="flex gap-2 text-xs text-slate-700">
                        <StatusIcon status={r.status} severity={r.severity} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span><b>{r.ruleId}</b> {r.explanation}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <details className="mt-4 rounded-2xl border border-slate-200 px-3.5 py-2 text-xs">
        <summary className="cursor-pointer font-semibold text-slate-700">Needs a verified source ({NEEDS_VERIFIED_SOURCE.length}): not checked</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
          {NEEDS_VERIFIED_SOURCE.map((n) => <li key={n.topic}><b>{n.topic}.</b> {n.why}</li>)}
        </ul>
      </details>
    </section>
  );
}

function EvidenceLog({ data, run }: { data: BookingPayload; run: RunAction }) {
  const list = data.view.booking.compliance?.evidence ?? [];
  const [type, setType] = useState<string>(EVIDENCE_TYPES[0]);
  const [reference, setReference] = useState("");
  const [obtainedOn, setObtainedOn] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Export evidence (X-03)</legend>
      {list.length > 0 ? (
        <ul className="mb-2 space-y-1 text-xs">
          {list.map((e, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--color-card)] px-3 py-1.5">
              <span><b>{e.type}</b> · {e.reference} · {isoToDisplay(e.obtainedOn)}</span>
              <button className="text-teal-700 hover:underline" onClick={() => run({ type: "apply", path: `compliance.evidence.${i}`, value: null })}>Remove</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-slate-500">No evidence logged. The sale isn&apos;t treated as zero-rated until you log one.</p>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <select className="input" value={type} onChange={(e) => setType(e.target.value)} aria-label="Evidence type">
          {EVIDENCE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input className="input" placeholder="Reference" value={reference} onChange={(e) => setReference(e.target.value)} aria-label="Evidence reference" />
        <input className="input" placeholder="Date obtained (DD-MM-YYYY)" value={obtainedOn} onChange={(e) => setObtainedOn(e.target.value)} aria-label="Date obtained" />
      </div>
      <button
        className="btn-ghost mt-2 text-xs"
        disabled={busy || !reference.trim() || !obtainedOn.trim()}
        onClick={async () => {
          setBusy(true);
          const e = await run({ type: "apply", path: "compliance.evidence", value: { type, reference, obtainedOn } });
          setBusy(false);
          setErr(e);
          if (!e) { setReference(""); setObtainedOn(""); }
        }}
      >
        Log evidence
      </button>
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
    </fieldset>
  );
}

// ---------------- Labels ----------------
function LabelsCard({ data, run }: { data: BookingPayload; run: RunAction }) {
  const view = data.view;
  const [format, setFormat] = useState<LabelFormat>("a6");
  const [which, setWhich] = useState<LabelSelection>("all");
  const blockers = labelBlockers(view);
  const count = buildLabels(view, which).length;
  const url = (download: boolean) => `/api/bookings/${data.id}/labels?format=${format}&which=${which}${download ? "&download=1" : ""}`;
  return (
    <section id="labels" data-tour="labels" className="card rounded-2xl p-4">
      <h3 className="text-base font-bold text-slate-900">Cargo labels</h3>
      <p className="text-xs text-slate-500">One label per pallet (&ldquo;Pallet n of N&rdquo;) and per carton (&ldquo;Carton n of N&rdquo;), with a barcode of the booking reference and package number.</p>
      <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">{LABEL_NOTE}</p>
      {blockers.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {blockers.map((x) => (
            <li key={x.message} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {x.message}
              <a className="font-semibold underline" href={x.fix === "addresses" ? "#addresses" : "#flightdeck"}>{x.fix === "addresses" ? "Open Addresses & contacts" : "Fix on the Flight Deck"}</a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="block text-xs font-medium text-slate-700">
            Format
            <select className="input mt-1" value={format} onChange={(e) => setFormat(e.target.value as LabelFormat)}>
              {LABEL_FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Print
            <select className="input mt-1" value={which} onChange={(e) => setWhich(e.target.value as LabelSelection)}>
              <option value="all">All</option>
              <option value="pallets">Pallets only</option>
              <option value="cartons">Cartons only</option>
            </select>
          </label>
          <Field run={run} label="Handling note (optional)" path="labelNote" value={view.booking.labelNote} hint="For example: Keep dry" />
          <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
            <a className="btn-ghost text-sm" href={url(false)} target="_blank" rel="noreferrer">Preview labels</a>
            <a className="btn-dark rounded-full text-sm" href={url(true)}><Download className="h-4 w-4" /> Download {count} label{count === 1 ? "" : "s"} (PDF)</a>
          </div>
        </div>
      )}
    </section>
  );
}
