import "server-only";
import { DISPATCH_LABELS } from "../../compliance/config";
import { inCurrency, type InvoiceModel } from "../../compliance/invoice";
import type { ComplianceView } from "../../compliance/rules";
import { isoToDisplay, num } from "../../format";
import type { BookingView, Party } from "../../types";
import { A4, GREY, MM, newDoc, Sheet } from "./kit";

const money = (m: InvoiceModel, gbpAmount: number) => {
  const v = inCurrency(m, gbpAmount);
  const sym = m.currency === "EUR" ? "EUR " : "£";
  return `${sym}${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const or = (v: string | null | undefined, fallback = "—") => (v && v.trim() ? v : fallback);

/** Two label/value columns; each row is as tall as its tallest cell, so wrapped values never overlap. */
function pairs(s: Sheet, rows: [string, string][], labelW: number) {
  const half = s.width / 2;
  for (let i = 0; i < rows.length; i += 2) {
    let h = 0;
    rows.slice(i, i + 2).forEach(([k, v], j) => {
      const x = j * half;
      h = Math.max(h, s.text(`${k}:`, { x, size: 9, bold: true, width: labelW - 4 }), s.text(v, { x: x + labelW, size: 9, width: half - labelW - 8 }));
    });
    s.y += h + 2;
  }
}

function party(s: Sheet, x: number, w: number, title: string, p: Party | null, eori: string | null) {
  const top = s.y;
  let h = s.text(title.toUpperCase(), { x, width: w, size: 7.5, bold: true, color: GREY });
  s.y += h;
  for (const line of [p?.name, p?.address, [p?.postcode, p?.country].filter(Boolean).join(", "), p?.contactName, [p?.phone, p?.email].filter(Boolean).join(" · "), eori ? `EORI: ${eori}` : null]) {
    if (!line) continue;
    h = s.text(line, { x, width: w, size: 9, bold: line === p?.name });
    s.y += h;
  }
  const used = s.y - top;
  s.y = top;
  return used;
}

/** The commercial invoice. Preview copies say DRAFT; the approved copy is generated once and stored. */
export async function invoicePdf(view: BookingView, c: ComplianceView, opts: { draft: boolean; at: Date }): Promise<Uint8Array> {
  const m = c.invoice, d = m.data, b = view.booking;
  const { doc, fonts } = await newDoc(`Commercial invoice ${or(d.invoiceNumber, "")}`, opts.at);
  let page = doc.addPage([A4.w, A4.h]);
  let s = new Sheet(page, fonts);
  const W = s.width;

  // Header
  s.text("COMMERCIAL INVOICE", { size: 18, bold: true });
  s.text(opts.draft ? "DRAFT · not approved" : "", { size: 9, bold: true, align: "right" });
  s.y += 26;
  const meta: [string, string][] = [
    ["Invoice number", or(d.invoiceNumber)],
    ["Invoice date", d.issueDate ? isoToDisplay(d.issueDate) : "—"],
    ["Proforma / PO / contract", `${or(d.orderReference)}${d.orderDate ? `, ${isoToDisplay(d.orderDate)}` : ""}`],
    ["Booking reference", or(b.bookingId)],
  ];
  pairs(s, meta, 110);
  s.y += 8;
  s.line(1);
  s.y += 8;

  // Parties
  const h1 = party(s, 0, W / 2 - 8, "Seller / exporter", d.seller, d.exporterEori);
  const h2 = party(s, W / 2 + 8, W / 2 - 8, `Buyer / consignee (${or(d.buyerType, "type not set")})`, d.buyer, d.buyerEori);
  s.y += Math.max(h1, h2) + 8;
  s.line();
  s.y += 8;

  // Shipment terms
  const terms: [string, string][] = [
    ["Incoterms", d.incoterm ? `${d.incoterm} ${or(d.incotermPlace, "")} (Incoterms 2020)` : "—"],
    ["Payment method", or(d.paymentMethod)],
    ["Transport", or(m.transport)],
    ["Route", or(m.route)],
    ["Collection date", b.readyToShipDate ? isoToDisplay(b.readyToShipDate) : "—"],
    ["Dispatch", d.dispatchMode ? DISPATCH_LABELS[d.dispatchMode] : "—"],
    ["Packages", m.packages.count != null ? `${m.packages.count} × ${or(m.packages.type, "package")}${m.packages.weightEachKg != null ? `, about ${num(m.packages.weightEachKg)} kg each` : ""}` : "—"],
    ["Weights", `Gross ${m.grossWeightKg != null ? `${num(m.grossWeightKg)} kg` : "—"} · Net ${m.netWeightKg != null ? `${num(m.netWeightKg)} kg` : "—"}`],
  ];
  pairs(s, terms, 90);
  s.y += 10;

  // Goods table
  const cols = [
    { k: "Description", w: 0.34 }, { k: "HS code", w: 0.11 }, { k: "Origin", w: 0.13 }, { k: "Qty", w: 0.09, r: true },
    { k: "Unit price", w: 0.13, r: true }, { k: "Net kg", w: 0.08, r: true }, { k: "Total", w: 0.12, r: true },
  ];
  const xs = cols.reduce<number[]>((acc, c2, i) => [...acc, i ? acc[i - 1] + cols[i - 1].w * W : 0], []);
  const row = (vals: string[], bold = false) => {
    const hs = vals.map((v, i) => s.text(v, { x: xs[i] + 2, width: cols[i].w * W - 4, size: 8.5, bold, align: cols[i].r ? "right" : "left" }));
    s.y += Math.max(...hs) + 4;
  };
  s.line(1);
  s.y += 4;
  row(cols.map((c2) => c2.k), true);
  s.line();
  s.y += 4;
  for (const l of m.lines) {
    if (!s.room(40)) {
      page = doc.addPage([A4.w, A4.h]);
      s = new Sheet(page, fonts);
    }
    row([
      `${l.sku ? `${l.sku} · ` : ""}${or(l.description)}`, or(l.hsCode), or(l.origin),
      l.quantity != null ? num(l.quantity) : "—", l.unitPrice != null ? money(m, l.unitPrice) : "—",
      l.netKg != null ? num(l.netKg) : "—", l.lineTotal != null ? money(m, l.lineTotal) : "—",
    ]);
  }
  s.line(1);
  s.y += 6;

  // Totals
  const totals: [string, string][] = [];
  if (m.goodsTotal != null) totals.push(["Goods total (value of the goods)", money(m, m.goodsTotal)]);
  if (m.discount) totals.push(["Discount", `-${money(m, m.discount)}`]);
  if (d.freightCharge) totals.push(["Freight", money(m, d.freightCharge)]);
  if (d.insuranceCharge) totals.push(["Insurance", money(m, d.insuranceCharge)]);
  if (m.invoiceTotal != null) totals.push([`Invoice total (${m.currency})`, money(m, m.invoiceTotal)]);
  for (const [k, v] of totals) {
    s.text(k, { x: W * 0.45, width: W * 0.35, size: 9, bold: k.startsWith("Invoice total") });
    s.text(v, { x: W * 0.8, width: W * 0.2, size: 9, bold: k.startsWith("Invoice total"), align: "right" });
    s.y += 14;
  }
  if (m.currency !== "GBP" && d.exchangeRate) {
    s.y += s.text(`Exchange rate: 1 GBP = ${d.exchangeRate} ${m.currency}, fixed on ${d.rateFixedOn ? isoToDisplay(d.rateFixedOn) : "—"}.`, { size: 8.5 });
  }
  s.y += 8;

  // Declarations
  if (c.vatLine) s.y += s.text(c.vatLine, { size: 9, bold: true }) + 4;
  if (d.originStatement) {
    s.y += s.text("Statement of origin", { size: 8, bold: true, color: GREY });
    s.y += s.text(d.originStatement, { size: 9 }) + 4;
  }
  if (d.chamberCertification) s.y += s.text("This invoice is to be certified by a Chamber of Commerce.", { size: 9 }) + 4;
  s.y += 10;
  s.text(`Booking ${or(b.bookingId)} · prepared with CargoPilot. CargoPilot doesn't book the carrier for you.`, { size: 7, color: GREY });
  return doc.save({ useObjectStreams: false });
}

export const invoiceFileName = (invoiceNumber: string | null, bookingRef: string | null) =>
  `Invoice-${(invoiceNumber ?? "draft").replace(/[^\w.-]+/g, "-")}-${(bookingRef ?? "booking").replace(/[^\w.-]+/g, "-")}.pdf`;

export { MM };
