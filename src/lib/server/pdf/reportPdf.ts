import "server-only";
import { COMPLIANCE_VERSION, NEEDS_VERIFIED_SOURCE, NOT_ADVICE } from "../../compliance/config";
import { payerText, type ComplianceView } from "../../compliance/rules";
import { gbp, isoToDisplay } from "../../format";
import type { BookingView } from "../../types";
import type { InvoiceStatus } from "../invoices";
import { A4, GREY, newDoc, Sheet } from "./kit";

const RESULT = { pass: "Passed", fail: "Failed", review: "Confirm", not_evaluable: "Waiting / info" } as const;

/** Compliance report: every X/M/D rule with its result, evidence and source. */
export async function reportPdf(view: BookingView, c: ComplianceView, invoice: InvoiceStatus, at: Date): Promise<Uint8Array> {
  const b = view.booking, d = c.invoice.data;
  const { doc, fonts } = await newDoc(`Compliance report ${b.bookingId ?? ""}`, at);
  let s = new Sheet(doc.addPage([A4.w, A4.h]), fonts);
  const ensure = (h: number) => { if (!s.room(h)) s = new Sheet(doc.addPage([A4.w, A4.h]), fonts); };
  const para = (t: string, o: Parameters<Sheet["text"]>[1] = {}) => { ensure(30); s.y += s.text(t, o) + 2; };

  para("COMPLIANCE REPORT", { size: 17, bold: true });
  para(`Booking ${b.bookingId ?? "—"} · ${b.originCity ?? "?"} to ${b.destinationCity ?? "?"}, ${b.destinationCountry ?? "?"} · generated ${at.toISOString().slice(0, 16).replace("T", " ")} UTC · rulebook ${COMPLIANCE_VERSION}`, { size: 8.5, color: GREY });
  para(NOT_ADVICE, { size: 9, bold: true });
  s.y += 4; s.line(1); s.y += 8;

  para("Summary", { size: 11, bold: true });
  para(`${c.red} rule(s) with critical (Red) items · ${c.amber} rule(s) with open warnings (Amber).`, { size: 9 });
  para(`Invoice ${d.invoiceNumber ?? "—"}: ${invoice.state === "approved" ? `approved by ${invoice.approval!.approver_name} on ${new Date(invoice.approval!.approved_at).toISOString().slice(0, 16).replace("T", " ")} UTC` : invoice.state === "out_of_date" ? "approval out of date: regenerate and approve again" : "not approved"}.`, { size: 9 });
  para(`Who pays import duty and VAT: ${payerText(c.payer, d.incoterm)}`, { size: 9 });
  if (c.zero.deadline) para(`UK VAT zero-rating: time of sale ${isoToDisplay(c.zero.timeOfSale)} (${c.zero.basis}); export evidence due by ${isoToDisplay(c.zero.deadline)}${c.zero.daysLeft != null ? ` (${c.zero.daysLeft >= 0 ? `${c.zero.daysLeft} days left` : `${-c.zero.daysLeft} days overdue`})` : ""}; evidence ${c.zero.evidenceLogged ? "logged" : "not logged yet"}. Keep export evidence for 6 years; report export sales in Box 6.`, { size: 9 });
  if (c.estimates.vatEstimate != null) para(`Import VAT (estimate, not a filing): customs value about ${gbp(c.estimates.customsValue!)} (${c.estimates.customsValueBasis}) × ${c.estimates.vatRate}% = ${gbp(c.estimates.vatEstimate)}. Rate source: ${c.estimates.vatSource}.`, { size: 9 });
  if (c.estimates.lowValue) {
    const lv = c.estimates.lowValue;
    para(lv.applies ? `Low-value flat duty (estimate): EUR ${lv.valueEur} consignment, ${lv.lines} tariff line(s) × EUR 3 = EUR ${lv.dutyEur}.` : `Low-value flat duty: not applicable (EUR ${lv.valueEur} is over EUR 150).`, { size: 9 });
  }
  s.y += 6; s.line(1); s.y += 8;

  para("Rules", { size: 11, bold: true });
  for (const r of c.rules) {
    ensure(70);
    const head = `${r.rule.id}  ${r.rule.short}: ${r.worst ? `${RESULT.fail} (${r.worst})` : RESULT[r.status]}`;
    s.y += s.text(head, { size: 9.5, bold: true }) + 1;
    for (const res of r.results) {
      const bits = [res.explanation];
      if (res.observed || res.expected) bits.push(`Found: ${res.observed ?? "—"} · Expected: ${res.expected ?? "—"}`);
      if (res.calculation) bits.push(`Working: ${res.calculation}`);
      if (res.keptReason) bits.push(`Kept with note: "${res.keptReason}"`);
      para(bits.join("\n"), { x: 10, size: 8.5 });
    }
    para(`Source: ${r.rule.source} (${r.rule.jurisdiction}), last verified ${isoToDisplay(r.rule.lastVerified)}. ${r.rule.sourceUrl}`, { x: 10, size: 7.5, color: GREY });
    s.y += 4;
  }

  s.y += 4; s.line(1); s.y += 8;
  para("Needs a verified source (not checked by CargoPilot)", { size: 11, bold: true });
  for (const n of NEEDS_VERIFIED_SOURCE) para(`• ${n.topic}: ${n.why}`, { size: 8.5 });
  s.y += 6;
  para(NOT_ADVICE, { size: 8.5, bold: true });
  return doc.save({ useObjectStreams: false });
}
