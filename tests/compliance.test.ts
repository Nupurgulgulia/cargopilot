import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { applyChange, ChangeError } from "@/lib/changes";
import { COMPLIANCE_RULES } from "@/lib/compliance/config";
import { buildInvoice } from "@/lib/compliance/invoice";
import { addMonthsISO, runCompliance } from "@/lib/compliance/rules";
import { buildView } from "@/lib/view";
import { importWorkbook, type SheetRows } from "@/lib/workbook";
import type { Booking, Item } from "@/lib/types";

const NOW = new Date("2026-10-27T10:00:00Z");
const file = fs.readFileSync(path.join(__dirname, "../public/samples/cargopilot-sample-audit.xlsx"));
function sample() {
  const wb = XLSX.read(file);
  const sheets = Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json<SheetRows[number]>(wb.Sheets[n], { header: 1, raw: true, defval: null })]));
  return importWorkbook(sheets).bookings;
}

/** Apply a list of [path, value] edits through the same code the app uses. */
function edit(booking: Booking, items: Item[], edits: [string, unknown][]) {
  let b = booking, its = items;
  for (const [p, v] of edits) ({ booking: b, items: its } = applyChange(b, its, p, v));
  return { booking: b, items: its };
}

const ADDRESS_COL = { company: "Brightwear Ltd", street: "1 Shoreditch High St", postcode: "E1 6PJ", contactName: "Ana Lee", phone: "+44 20 7946 0000", email: "ops@brightwear.example", notes: null };
const ADDRESS_DEL = { company: "Spree Handel GmbH", street: "Torstraße 10", postcode: "10119", contactName: "Jan Weber", phone: "+49 30 1234567", email: "lager@spree.example", notes: null };

/** SA-01 (cleared, London → Berlin) with every invoice and compliance input filled in. */
function complete() {
  const sa01 = sample().find((x) => x.booking.bookingId === "SA-01")!;
  // UK-made goods, so preferential origin (M-03) can pass.
  const ukItems = sa01.items.map((it) => ({ ...it, countryOfOrigin: "United Kingdom" }));
  const r = edit(sa01.booking, ukItems, [
    ["collection", ADDRESS_COL], ["delivery", ADDRESS_DEL],
    ["invoice.issueDate", "27-10-2026"], ["invoice.orderReference", "PO-7731"], ["invoice.orderDate", "20-10-2026"],
    ["invoice.paymentMethod", "Bank transfer, 30 days"], ["invoice.incoterm", "DAP"], ["invoice.incotermPlace", "Berlin"],
    ["invoice.buyerType", "B2B"], ["invoice.exporterEori", "GB 123456789000"], ["invoice.buyerEori", "DE123456789012345"],
    ["invoice.originStatement", "Approved statement of origin text (supplied by the seller)"],
    ["compliance.exportAgent", "Example Forwarding Ltd"], ["compliance.classificationCheckedBy", "Ana Lee"],
    ["compliance.goodsSentOn", "02-11-2026"],
    ["compliance.evidence", { type: "Courier airway bill number", reference: "AWB 123-45678901", obtainedOn: "03-11-2026" }],
  ]);
  return { ...r, booking: { ...r.booking, sellerConfirmedAt: "2026-10-27T09:00:00Z" } };
}
const run = (b: Booking, items: Item[]) => runCompliance(buildView(b, items, NOW), NOW);
const rule = (c: ReturnType<typeof run>, id: string) => c.rules.find((r) => r.rule.id === id)!;

describe("compliance rulebook config", () => {
  it("gives every rule a source link, jurisdiction and last-verified date", () => {
    for (const r of COMPLIANCE_RULES) {
      expect(r.sourceUrl).toMatch(/^https:\/\//);
      expect(r.jurisdiction).toBeTruthy();
      expect(r.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("a complete booking", () => {
  it("passes every rule and can be approved", () => {
    const { booking, items } = complete();
    const c = run(booking, items);
    const notPassing = c.results.filter((r) => r.status === "fail");
    expect(notPassing.map((r) => `${r.ruleId}: ${r.explanation}`)).toEqual([]);
    expect(c.approveBlockers).toEqual([]);
    expect(c.vatLine).toBe("Zero-rated export: UK VAT not charged.");
  });
});

describe("UK export rules", () => {
  it("X-01: Red when the GB EORI is missing, Amber when malformed", () => {
    const { booking, items } = complete();
    const missing = run({ ...booking, invoice: { ...booking.invoice!, exporterEori: null } }, items);
    expect(rule(missing, "X-01").worst).toBe("Red");
    const odd = run({ ...booking, invoice: { ...booking.invoice!, exporterEori: "GB12" } }, items);
    expect(rule(odd, "X-01").worst).toBe("Amber");
  });

  it("X-02: Amber until a declaration reference or agent is recorded", () => {
    const { booking, items } = complete();
    const c = run({ ...booking, compliance: { ...booking.compliance!, exportAgent: null } }, items);
    expect(rule(c, "X-02").worst).toBe("Amber");
  });

  it("X-03: counts 3 months from the time of sale; Amber under 30 days, Red once passed", () => {
    const { booking, items } = complete();
    const noEvidence = { ...booking, compliance: { ...booking.compliance!, evidence: [] } };
    // Goods sent 2 Nov 2026 → deadline 2 Feb 2027: plenty of time, not yet zero-rated.
    const early = run(noEvidence, items);
    expect(early.zero.deadline).toBe("2027-02-02");
    expect(rule(early, "X-03").status).toBe("not_evaluable");
    expect(early.vatLine).toBeNull();
    // Payment received earlier (1 Aug 2026) is the time of sale → deadline 1 Nov 2026, 5 days away.
    const soon = run({ ...noEvidence, compliance: { ...noEvidence.compliance, paymentReceivedOn: "2026-08-01" } }, items);
    expect(soon.zero.timeOfSale).toBe("2026-08-01");
    expect(rule(soon, "X-03").worst).toBe("Amber");
    // Sent in June → deadline passed with no evidence.
    const late = run({ ...noEvidence, compliance: { ...noEvidence.compliance, goodsSentOn: "2026-06-01" } }, items);
    expect(rule(late, "X-03").worst).toBe("Red");
  });

  it("addMonthsISO clamps to the end of shorter months", () => {
    expect(addMonthsISO("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonthsISO("2026-08-01", 3)).toBe("2026-11-01");
  });

  it("X-04: Amber when the customer collects, Red when they deliver to a UK address", () => {
    const { booking, items } = complete();
    expect(rule(run({ ...booking, invoice: { ...booking.invoice!, dispatchMode: "customer_collects" } }, items), "X-04").worst).toBe("Amber");
    const uk = run({ ...booking, invoice: { ...booking.invoice!, dispatchMode: "customer_delivers_uk" } }, items);
    expect(rule(uk, "X-04").worst).toBe("Red");
    expect(uk.vatLine).toBeNull();
  });

  it("X-05: Amber until someone records the classification check", () => {
    const { booking, items } = complete();
    expect(rule(run({ ...booking, compliance: { ...booking.compliance!, classificationCheckedBy: null } }, items), "X-05").worst).toBe("Amber");
  });

  it("X-06: Amber when Chamber certification is marked", () => {
    const { booking, items } = complete();
    expect(rule(run({ ...booking, invoice: { ...booking.invoice!, chamberCertification: true } }, items), "X-06").worst).toBe("Amber");
  });
});

describe("destination import rules", () => {
  it("M-01: missing EU EORI is Red for B2B and Amber for B2C", () => {
    const { booking, items } = complete();
    const noEori = { ...booking.invoice!, buyerEori: null };
    expect(rule(run({ ...booking, invoice: { ...noEori, buyerType: "B2B" } }, items), "M-01").worst).toBe("Red");
    expect(rule(run({ ...booking, invoice: { ...noEori, buyerType: "B2C" } }, items), "M-01").worst).toBe("Amber");
  });

  it("M-02: Red without a named place; DDP is Amber and puts duty on the seller", () => {
    const { booking, items } = complete();
    expect(rule(run({ ...booking, invoice: { ...booking.invoice!, incotermPlace: null } }, items), "M-02").worst).toBe("Red");
    const ddp = run({ ...booking, invoice: { ...booking.invoice!, incoterm: "DDP" } }, items);
    expect(rule(ddp, "M-02").worst).toBe("Amber");
    expect(ddp.payer).toBe("seller");
    expect(run(booking, items).payer).toBe("buyer");
  });

  it("M-03: Amber for non-UK/EU origin or a missing origin statement", () => {
    const { booking, items } = complete();
    const china = items.map((it) => ({ ...it, countryOfOrigin: "China" }));
    expect(rule(run(booking, china), "M-03").worst).toBe("Amber");
    expect(rule(run({ ...booking, invoice: { ...booking.invoice!, originStatement: null } }, items), "M-03").worst).toBe("Amber");
  });

  it("M-04: shows an import VAT estimate at the dated standard rate", () => {
    const { booking, items } = complete();
    const c = run(booking, items);
    expect(c.estimates.vatRate).toBe(19); // Germany, Your Europe page checked 13/07/2026
    expect(c.estimates.vatEstimate).toBeCloseTo((c.estimates.customsValue! * 19) / 100, 2);
    expect(rule(c, "M-04").results[0].explanation).toMatch(/^Estimate, not a filing/);
  });

  it("M-05 only appears for the Netherlands", () => {
    const { booking, items } = complete();
    expect(run(booking, items).results.some((r) => r.ruleId === "M-05")).toBe(false);
    const nl = run({ ...booking, destinationCity: "Rotterdam", destinationCountry: "Netherlands" }, items);
    expect(nl.results.some((r) => r.ruleId === "M-05")).toBe(true);
  });

  it("M-06: B2C under EUR 150 shows EUR 3 per distinct tariff line; near the line is Amber", () => {
    const { booking, items } = complete();
    const one = [{ ...items[0], quantity: 10, unitPrice: 5, cartons: 1, unitsPerCarton: 10 }];
    const b2c = { ...booking, declaredValue: 50, invoice: { ...booking.invoice!, buyerType: "B2C" as const }, compliance: { ...booking.compliance!, eurRate: 1.15, eurRateDate: "2026-10-27" } };
    const low = run(b2c, one);
    expect(low.estimates.lowValue).toMatchObject({ applies: true, lines: 1, dutyEur: 3 });
    // £128 × 1.15 = EUR 147.20: within 5% of EUR 150.
    const near = run({ ...b2c, declaredValue: 128 }, [{ ...one[0], quantity: 128, unitPrice: 1, unitsPerCarton: 128 }]);
    expect(rule(near, "M-06").worst).toBe("Amber");
    expect(rule(run({ ...b2c, compliance: { ...b2c.compliance, eurRate: null } }, one), "M-06").status).toBe("not_evaluable");
  });
});

describe("document rules", () => {
  it("D-01: one Red per missing mandatory field, each with a fix that opens the field", () => {
    const { booking, items } = complete();
    const c = run({ ...booking, invoice: { ...booking.invoice!, orderReference: null, paymentMethod: null } }, items);
    const d01 = c.results.filter((r) => r.ruleId === "D-01" && r.status === "fail");
    expect(d01.map((r) => r.fields[0]).sort()).toEqual(["invoice.orderReference", "invoice.paymentMethod"]);
    expect(d01.every((r) => r.suggestions[0]?.kind === "input")).toBe(true);
  });

  it("D-01: a non-GBP invoice needs the rate and the date it was fixed", () => {
    const { booking, items } = complete();
    const c = run({ ...booking, invoice: { ...booking.invoice!, currency: "EUR" } }, items);
    expect(c.results.filter((r) => r.ruleId === "D-01" && r.status === "fail").map((r) => r.fields[0]).sort()).toEqual(["invoice.exchangeRate", "invoice.rateFixedOn"]);
  });

  it("D-02: invoice goods total must match the declared value within 1%", () => {
    const { booking, items } = complete();
    expect(rule(run({ ...booking, declaredValue: (booking.declaredValue ?? 0) * 1.05 }, items), "D-02").worst).toBe("Red");
  });

  it("D-03: needs seller, buyer, collection and delivery details", () => {
    const { booking, items } = complete();
    expect(rule(run({ ...booking, delivery: null }, items), "D-03").worst).toBe("Red");
  });

  it("D-04: rejects vague descriptions such as \"parts\" or \"goods\"", () => {
    const { booking, items } = complete();
    expect(rule(run(booking, [{ ...items[0], description: "Goods" }]), "D-04").worst).toBe("Red");
    expect(rule(run(booking, [{ ...items[0], description: "spare parts" }]), "D-04").worst).toBe("Red");
  });

  it("net weight is the sum of kg/unit × quantity", () => {
    const { booking, items } = complete();
    const m = buildInvoice(buildView(booking, items, NOW));
    expect(m.netWeightKg).toBeCloseTo(items.reduce((s, it) => s + (it.unitWeightKg ?? 0) * (it.quantity ?? 0), 0), 2);
  });
});

describe("sample workbook SA-01 to SA-08", () => {
  const bookings = sample();
  it("runs every enabled rule on every booking without throwing", () => {
    expect(bookings.map((b) => b.booking.bookingId)).toEqual(["SA-01", "SA-02", "SA-03", "SA-04", "SA-05", "SA-06", "SA-07", "SA-08"]);
    for (const b of bookings) {
      const c = run(b.booking, b.items);
      expect(c.rules.length).toBe(COMPLIANCE_RULES.filter((r) => r.enabled).length);
      // Nothing entered yet: no EORI, no Incoterm, unconfirmed: never approvable.
      expect(c.approveBlockers.length).toBeGreaterThan(0);
      expect(rule(c, "X-01").worst).toBe("Red");
    }
  });

  it("SA-02's declared-value error also fails D-02; SA-01 reconciles", () => {
    const by = (id: string) => bookings.find((b) => b.booking.bookingId === id)!;
    expect(rule(run(by("SA-02").booking, by("SA-02").items), "D-02").worst).toBe("Red");
    expect(rule(run(by("SA-01").booking, by("SA-01").items), "D-02").status).toBe("pass");
  });

  it("SA-06 (an item missing its HS code) fails X-05 and D-04", () => {
    const sa06 = bookings.find((b) => b.booking.bookingId === "SA-06")!;
    const c = run(sa06.booking, sa06.items);
    expect(rule(c, "X-05").worst).toBe("Red");
    expect(rule(c, "D-04").worst).toBe("Red");
  });
});

describe("input validation", () => {
  it("rejects bad Incoterms, rates and evidence", () => {
    const { booking, items } = complete();
    expect(() => applyChange(booking, items, "invoice.incoterm", "FOB")).toThrow(ChangeError);
    expect(() => applyChange(booking, items, "invoice.exchangeRate", -1)).toThrow(ChangeError);
    expect(() => applyChange(booking, items, "compliance.evidence", { type: "Photo", reference: "x", obtainedOn: "01-11-2026" })).toThrow(ChangeError);
  });
});
