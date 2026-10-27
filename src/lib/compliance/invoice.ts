// The commercial invoice as data: prefilled from the booking, with totals, weights and currency
// worked out the same way every time. The PDF, the D- rules and the approval hash all read this.
import { chosenCarrier } from "../carrierEmail";
import { carrierLabel } from "../carriers";
import { ORIGIN_COUNTRY, R02_TOLERANCE } from "../constants";
import { round2 } from "../format";
import type { Booking, BookingView, InvoiceData, Item, Party } from "../types";

export const emptyParty = (): Party => ({ name: null, address: null, postcode: null, country: null, contactName: null, phone: null, email: null });

const blank = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");
const pickSet = <T extends object>(stored: Partial<T> | null | undefined, base: T): T => {
  const out = { ...base };
  for (const [k, v] of Object.entries(stored ?? {})) if (!blank(v)) (out as Record<string, unknown>)[k] = v;
  return out;
};

/** What CargoPilot already knows, used wherever the seller hasn't typed something else. */
export function invoiceDefaults(b: Booking): InvoiceData {
  const col = b.collection, del = b.delivery;
  return {
    invoiceNumber: b.bookingId ? `INV-${b.bookingId}` : null,
    issueDate: null, // entered, never "today": a moving default would put every approval out of date at midnight
    orderReference: null,
    orderDate: null,
    paymentMethod: null,
    discount: null,
    freightCharge: null,
    insuranceCharge: null,
    incoterm: null,
    incotermPlace: null,
    currency: "GBP",
    exchangeRate: null,
    rateFixedOn: null,
    seller: {
      name: b.sellerName,
      address: [col?.company && col.company !== b.sellerName ? col.company : null, col?.street, b.originCity].filter(Boolean).join(", ") || null,
      postcode: col?.postcode ?? null,
      country: b.originCountry ?? ORIGIN_COUNTRY,
      contactName: col?.contactName ?? null,
      phone: col?.phone ?? null,
      email: col?.email ?? null,
    },
    buyer: {
      name: del?.company ?? null,
      address: [del?.street, b.destinationCity].filter(Boolean).join(", ") || null,
      postcode: del?.postcode ?? null,
      country: b.destinationCountry,
      contactName: del?.contactName ?? null,
      phone: del?.phone ?? null,
      email: del?.email ?? null,
    },
    buyerType: null,
    packageType: "Pallet",
    exporterEori: null,
    buyerEori: null,
    originStatement: null,
    chamberCertification: false,
    dispatchMode: "seller_dispatches",
  };
}

/** Stored values win over the defaults, field by field (parties too). */
export function effectiveInvoice(b: Booking): InvoiceData {
  const d = invoiceDefaults(b);
  const s = b.invoice ?? null;
  const inv = pickSet<InvoiceData>(s ?? {}, d);
  inv.seller = pickSet<Party>(s?.seller ?? {}, d.seller!);
  inv.buyer = pickSet<Party>(s?.buyer ?? {}, d.buyer!);
  return inv;
}

export interface InvoiceLine {
  index: number;
  sku: string | null;
  description: string | null;
  hsCode: string | null;
  origin: string | null;
  quantity: number | null;
  unitPrice: number | null;
  /** GBP */
  lineTotal: number | null;
  netKg: number | null;
}

export interface InvoiceModel {
  data: InvoiceData;
  lines: InvoiceLine[];
  /** All money in GBP; `inCurrency` converts for printing. */
  goodsTotal: number | null;
  discount: number;
  charges: number;
  invoiceTotal: number | null;
  currency: string;
  rate: number;
  netWeightKg: number | null;
  grossWeightKg: number | null;
  packages: { count: number | null; type: string | null; weightEachKg: number | null };
  transport: string | null;
  route: string | null;
  declaredValue: number | null;
}

export const inCurrency = (m: InvoiceModel, gbpAmount: number) => round2(gbpAmount * m.rate);

export function buildInvoice(view: BookingView): InvoiceModel {
  const b = view.booking;
  const data = effectiveInvoice(b);
  const lines = view.items.map((it: Item, i): InvoiceLine => ({
    index: i,
    sku: it.sku,
    description: it.description,
    hsCode: it.hsCode,
    origin: it.countryOfOrigin,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    lineTotal: it.quantity != null && it.unitPrice != null ? round2(it.quantity * it.unitPrice) : null,
    netKg: it.quantity != null && it.unitWeightKg != null ? round2(it.quantity * it.unitWeightKg) : null,
  }));
  const goodsTotal = lines.length && lines.every((l) => l.lineTotal != null) ? round2(lines.reduce((s, l) => s + l.lineTotal!, 0)) : null;
  const netWeightKg = lines.length && lines.every((l) => l.netKg != null) ? round2(lines.reduce((s, l) => s + l.netKg!, 0)) : null;
  const discount = data.discount ?? 0;
  const charges = (data.freightCharge ?? 0) + (data.insuranceCharge ?? 0);
  const carrier = chosenCarrier(view);
  const packagesCount = (data.packageType ?? "Pallet").toLowerCase() === "carton" ? b.cartons : b.pallets;
  return {
    data,
    lines,
    goodsTotal,
    discount,
    charges,
    invoiceTotal: goodsTotal != null ? round2(goodsTotal - discount + charges) : null,
    currency: data.currency ?? "GBP",
    rate: data.currency && data.currency !== "GBP" && data.exchangeRate ? data.exchangeRate : 1,
    netWeightKg,
    grossWeightKg: b.grossWeightKg,
    packages: {
      count: packagesCount,
      type: data.packageType,
      weightEachKg: packagesCount && b.grossWeightKg != null ? round2(b.grossWeightKg / packagesCount) : null,
    },
    transport: carrier ? `Road freight, ${carrierLabel(carrier.carrier)}` : null,
    route: b.originCity && b.destinationCity ? `${b.originCity}, ${b.originCountry ?? ORIGIN_COUNTRY} to ${b.destinationCity}, ${b.destinationCountry ?? ""}`.replace(/, $/, "") : null,
    declaredValue: b.declaredValue,
  };
}

/** Within the same 1% tolerance as R-02. */
export const withinTolerance = (a: number, b: number) => (b === 0 ? a === 0 : Math.abs(a - b) / b <= R02_TOLERANCE + 1e-9);

/** Mandatory invoice fields (business.gov.uk "How to create an export invoice"), as form paths. */
export interface InvoiceField {
  path: string;
  label: string;
  inputType: "text" | "number" | "date" | "select";
  options?: string[];
  missing: (m: InvoiceModel, view: BookingView) => boolean;
}

const partyFields = (who: "seller" | "buyer", label: string): InvoiceField[] => [
  { path: `invoice.${who}.name`, label: `${label} name`, inputType: "text", missing: (m) => blank(m.data[who]?.name) },
  { path: `invoice.${who}.address`, label: `${label} address`, inputType: "text", missing: (m) => blank(m.data[who]?.address) },
  { path: `invoice.${who}.postcode`, label: `${label} postcode`, inputType: "text", missing: (m) => blank(m.data[who]?.postcode) },
  { path: `invoice.${who}.country`, label: `${label} country`, inputType: "text", missing: (m) => blank(m.data[who]?.country) },
  { path: `invoice.${who}.phone`, label: `${label} phone`, inputType: "text", missing: (m) => blank(m.data[who]?.phone) && blank(m.data[who]?.email) },
];

export const INVOICE_FIELDS: InvoiceField[] = [
  ...partyFields("seller", "Seller"),
  ...partyFields("buyer", "Buyer"),
  { path: "invoice.invoiceNumber", label: "Invoice number", inputType: "text", missing: (m) => blank(m.data.invoiceNumber) },
  { path: "invoice.issueDate", label: "Invoice date", inputType: "date", missing: (m) => blank(m.data.issueDate) },
  { path: "invoice.orderReference", label: "Proforma, purchase order or contract number", inputType: "text", missing: (m) => blank(m.data.orderReference) },
  { path: "invoice.orderDate", label: "Proforma, purchase order or contract date", inputType: "date", missing: (m) => blank(m.data.orderDate) },
  { path: "invoice.paymentMethod", label: "Payment method", inputType: "text", missing: (m) => blank(m.data.paymentMethod) },
  { path: "invoice.currency", label: "Invoice currency", inputType: "select", options: ["GBP", "EUR"], missing: (m) => blank(m.data.currency) },
  { path: "invoice.exchangeRate", label: "Exchange rate (1 GBP = …)", inputType: "number", missing: (m) => m.currency !== "GBP" && !m.data.exchangeRate },
  { path: "invoice.rateFixedOn", label: "Date the exchange rate was fixed", inputType: "date", missing: (m) => m.currency !== "GBP" && blank(m.data.rateFixedOn) },
  { path: "invoice.incoterm", label: "Incoterm", inputType: "select", options: ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP"], missing: (m) => blank(m.data.incoterm) },
  { path: "invoice.incotermPlace", label: "Incoterm named place", inputType: "text", missing: (m) => blank(m.data.incotermPlace) },
  { path: "invoice.packageType", label: "Package type", inputType: "select", options: ["Pallet", "Carton", "Crate", "Case", "Drum", "Bag"], missing: (m) => blank(m.data.packageType) },
  { path: "booking.grossWeightKg", label: "Gross weight", inputType: "number", missing: (m) => m.grossWeightKg == null },
  { path: "booking.chosenCarrier", label: "Means of transport (carrier)", inputType: "text", missing: (m) => m.transport == null },
  { path: "booking.declaredValue", label: "Actual value of the goods", inputType: "number", missing: (m) => m.declaredValue == null || m.goodsTotal == null },
];

/** Canonical JSON (sorted keys) so the same invoice always hashes the same. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

/** Everything printed on the invoice: if any of it changes, an approval is out of date. */
export function invoiceSnapshot(m: InvoiceModel, view: BookingView, vatLine: string | null) {
  const b = view.booking;
  return {
    data: m.data, lines: m.lines, goodsTotal: m.goodsTotal, invoiceTotal: m.invoiceTotal, currency: m.currency, rate: m.rate,
    netWeightKg: m.netWeightKg, grossWeightKg: m.grossWeightKg, packages: m.packages, transport: m.transport, route: m.route,
    declaredValue: m.declaredValue, vatLine,
    booking: { ref: b.bookingId, collection: b.collection ?? null, delivery: b.delivery ?? null, readyToShipDate: b.readyToShipDate, pallets: b.pallets, cartons: b.cartons },
  };
}
