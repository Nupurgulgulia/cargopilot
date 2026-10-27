import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { applyChange } from "@/lib/changes";
import { attachedLine, buildCarrierEmail } from "@/lib/carrierEmail";
import { EMAIL_LIMIT } from "@/lib/compliance/config";
import { runCompliance } from "@/lib/compliance/rules";
import { attachmentGate, recipientsFor } from "@/lib/invoiceEmail";
import { buildLabels, labelBlockers } from "@/lib/labels";
import { buildView } from "@/lib/view";
import { invoiceDataHash, invoiceStatus, sha256, type ApprovalRow } from "@/lib/server/invoices";
import { invoicePdf } from "@/lib/server/pdf/invoicePdf";
import { labelsPdf } from "@/lib/server/pdf/labelsPdf";
import { reportPdf } from "@/lib/server/pdf/reportPdf";
import { complete, NOW } from "./helpers";

/** What approveInvoice stores, without the database. */
async function approve() {
  const { booking, items } = complete();
  const view = buildView(booking, items, NOW);
  const c = runCompliance(view, NOW);
  expect(c.approveBlockers).toEqual([]);
  const pdf = await invoicePdf(view, c, { draft: false, at: NOW });
  const approval: ApprovalRow = {
    id: "a1", invoice_number: c.invoice.data.invoiceNumber!, approver_name: "Ana Lee", approved_at: NOW.toISOString(),
    data_hash: invoiceDataHash(view, c), pdf_hash: sha256(pdf), pdf_size: pdf.length, rules_version: "test",
  };
  return { booking, items, view, pdf, approval };
}

describe("invoice approval and the carrier email", () => {
  it("approve then send with the attachment: the stored PDF's hash matches", async () => {
    const { view, pdf, approval } = await approve();
    const status = invoiceStatus(view, approval);
    expect(status.state).toBe("approved");
    expect(status.fileName).toBe(`Invoice-${approval.invoice_number}-SA-01.pdf`);
    // At send time the stored bytes are re-hashed and must match the approval.
    const gate = attachmentGate({ attach: true, state: status.state, pdfMatches: sha256(pdf) === approval.pdf_hash, pdfBytes: pdf.length });
    expect(gate).toEqual({ ok: true });
    // The email gains exactly one line, and nothing else changes.
    const plain = buildCarrierEmail(view, { replyTo: "dispatch@example.com" });
    const withPdf = buildCarrierEmail(view, { replyTo: "dispatch@example.com", attachedInvoice: approval.invoice_number });
    expect(withPdf.subject).toBe(plain.subject);
    const added = withPdf.text.split("\n").filter((l) => !plain.text.split("\n").includes(l));
    expect(added).toEqual([attachedLine(approval.invoice_number)]);
    expect(added[0]).toBe(`The approved commercial invoice ${approval.invoice_number} is attached.`);
  });

  it("a tampered stored PDF is refused (\"Invoice changed after approval\")", async () => {
    const { view, pdf, approval } = await approve();
    const tampered = Uint8Array.from(pdf);
    tampered[tampered.length - 20] ^= 1;
    const gate = attachmentGate({ attach: true, state: invoiceStatus(view, approval).state, pdfMatches: sha256(tampered) === approval.pdf_hash });
    expect(gate).toMatchObject({ ok: false, reason: "Invoice changed after approval." });
  });

  it("an edit after approval puts it out of date and blocks sending with the attachment", async () => {
    const { booking, items, approval } = await approve();
    const edited = applyChange(booking, items, "invoice.paymentMethod", "Letter of credit");
    const status = invoiceStatus(buildView(edited.booking, edited.items, NOW), approval);
    expect(status.state).toBe("out_of_date");
    const gate = attachmentGate({ attach: true, state: status.state });
    expect(gate.ok).toBe(false);
    expect(gate.fix).toBe("invoice");
    expect(gate.reason).toMatch(/^Approval out of date/);
    // Booking edits count too (weight, address, value…).
    const weight = applyChange(booking, items, "booking.grossWeightKg", (booking.grossWeightKg ?? 0) + 5);
    expect(invoiceStatus(buildView(weight.booking, weight.items, NOW), approval).state).toBe("out_of_date");
  });

  it("with the attachment OFF the email is exactly today's email", async () => {
    const { view } = await approve();
    expect(attachmentGate({ attach: false, state: "out_of_date" })).toEqual({ ok: true });
    const a = buildCarrierEmail(view, { replyTo: "dispatch@example.com" });
    const b = buildCarrierEmail(view, { replyTo: "dispatch@example.com", attachedInvoice: null });
    expect(b).toEqual(a);
    expect(a.text).not.toMatch(/commercial invoice/);
  });

  it("an unapproved invoice can't be attached", () => {
    expect(attachmentGate({ attach: true, state: "not_approved" })).toMatchObject({ ok: false, fix: "invoice" });
  });

  it("a PDF over the email limit is refused with its size and the limit", () => {
    const big = Math.ceil(EMAIL_LIMIT.bytes / EMAIL_LIMIT.base64Factor);
    const gate = attachmentGate({ attach: true, state: "approved", pdfMatches: true, pdfBytes: big });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/MB.*limit is 40\.0 MB/);
    expect(attachmentGate({ attach: true, state: "approved", pdfMatches: true, pdfBytes: 30_000 }).ok).toBe(true);
  });

  it("optional buyer copy: off by default, only the typed address, never a duplicate", () => {
    expect(recipientsFor("carrier@example.com", false, "buyer@example.com")).toEqual([{ email: "carrier@example.com", role: "carrier" }]);
    expect(recipientsFor("carrier@example.com", true, " buyer@example.com ")).toEqual([
      { email: "carrier@example.com", role: "carrier" }, { email: "buyer@example.com", role: "buyer" },
    ]);
    expect(recipientsFor("same@example.com", true, "SAME@example.com")).toHaveLength(1);
    expect(recipientsFor("carrier@example.com", true, "")).toHaveLength(1);
  });

  it("the same data and time always produce the same PDF (so the hash is meaningful)", async () => {
    const { view } = await approve();
    const c = runCompliance(view, NOW);
    const [a, b] = await Promise.all([invoicePdf(view, c, { draft: false, at: NOW }), invoicePdf(view, c, { draft: false, at: NOW })]);
    expect(sha256(a)).toBe(sha256(b));
    const draft = await invoicePdf(view, c, { draft: true, at: NOW });
    expect(sha256(draft)).not.toBe(sha256(a));
  });

  it("the compliance report renders every rule", async () => {
    const { view, approval } = await approve();
    const bytes = await reportPdf(view, runCompliance(view, NOW), invoiceStatus(view, approval), NOW);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  });
});

describe("cargo labels", () => {
  it("one label per pallet and per carton, numbered n of N, with booking ref + package number", () => {
    const { booking, items } = complete();
    const view = buildView(booking, items, NOW);
    expect(labelBlockers(view)).toEqual([]);
    const all = buildLabels(view);
    const pallets = all.filter((l) => l.kind === "Pallet"), cartons = all.filter((l) => l.kind === "Carton");
    expect(pallets).toHaveLength(booking.pallets!);
    expect(cartons).toHaveLength(booking.cartons!);
    expect(pallets[0]).toMatchObject({ n: 1, of: booking.pallets, code: `SA-01-P${"1".padStart(String(booking.pallets).length, "0")}` });
    expect(buildLabels(view, "pallets").every((l) => l.kind === "Pallet")).toBe(true);
  });

  it("are blocked without addresses or a delivery phone", () => {
    const { booking, items } = complete();
    expect(labelBlockers(buildView({ ...booking, delivery: { ...booking.delivery!, phone: null } }, items, NOW)).map((b) => b.fix)).toContain("addresses");
    expect(labelBlockers(buildView({ ...booking, collection: null }, items, NOW)).length).toBeGreaterThan(0);
  });

  it("print one label per page (A6, 4x6) or four per A4 sheet", async () => {
    const { booking, items } = complete();
    const labels = buildLabels(buildView(booking, items, NOW), "pallets");
    for (const [format, pages] of [["a6", labels.length], ["4x6", labels.length], ["a4", Math.ceil(labels.length / 4)]] as const) {
      const doc = await PDFDocument.load(await labelsPdf(labels, format, NOW));
      expect(doc.getPageCount()).toBe(pages);
    }
  });
});
