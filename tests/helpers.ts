// Shared fixtures: the sample workbook bookings and one booking with every invoice input filled in.
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { applyChange } from "@/lib/changes";
import { importWorkbook, type SheetRows } from "@/lib/workbook";
import type { Booking, Item } from "@/lib/types";

export const NOW = new Date("2026-10-27T10:00:00Z");
const file = fs.readFileSync(path.join(__dirname, "../public/samples/cargopilot-sample-audit.xlsx"));

export function sample() {
  const wb = XLSX.read(file);
  const sheets = Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json<SheetRows[number]>(wb.Sheets[n], { header: 1, raw: true, defval: null })]));
  return importWorkbook(sheets).bookings;
}

export function edit(booking: Booking, items: Item[], edits: [string, unknown][]) {
  let b = booking, its = items;
  for (const [p, v] of edits) ({ booking: b, items: its } = applyChange(b, its, p, v));
  return { booking: b, items: its };
}

/** SA-01 (London → Berlin), UK-made goods, confirmed, with every invoice and compliance input filled in. */
export function complete() {
  const sa01 = sample().find((x) => x.booking.bookingId === "SA-01")!;
  const ukItems = sa01.items.map((it) => ({ ...it, countryOfOrigin: "United Kingdom" }));
  const r = edit(sa01.booking, ukItems, [
    ["collection", { company: "Brightwear Ltd", street: "1 Shoreditch High St", postcode: "E1 6PJ", contactName: "Ana Lee", phone: "+44 20 7946 0000", email: "ops@brightwear.example", notes: null }],
    ["delivery", { company: "Spree Handel GmbH", street: "Torstraße 10", postcode: "10119", contactName: "Jan Weber", phone: "+49 30 1234567", email: "lager@spree.example", notes: null }],
    ["invoice.issueDate", "27-10-2026"], ["invoice.orderReference", "PO-7731"], ["invoice.orderDate", "20-10-2026"],
    ["invoice.paymentMethod", "Bank transfer, 30 days"], ["invoice.incoterm", "DAP"], ["invoice.incotermPlace", "Berlin"],
    ["invoice.buyerType", "B2B"], ["invoice.exporterEori", "GB123456789000"], ["invoice.buyerEori", "DE123456789012345"],
    ["invoice.originStatement", "Approved statement of origin text (supplied by the seller)"],
    ["compliance.exportAgent", "Example Forwarding Ltd"], ["compliance.classificationCheckedBy", "Ana Lee"],
    ["compliance.goodsSentOn", "02-11-2026"],
    ["compliance.evidence", { type: "Courier airway bill number", reference: "AWB 123-45678901", obtainedOn: "03-11-2026" }],
  ]);
  return { ...r, booking: { ...r.booking, sellerConfirmedAt: "2026-10-27T09:00:00Z" } };
}
