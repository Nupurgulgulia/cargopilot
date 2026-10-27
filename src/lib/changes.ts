// Applies one field change to a booking. Every change goes through here —
// Error Detective fixes, chat updates and manual edits — so values are always
// coerced and validated the same way.
import {
  DESTINATION_COUNTRIES, DESTINATION_TYPES, DESTINATION_CITIES, ITEM_ORIGIN_COUNTRIES, ORIGIN_CITIES, ORIGIN_COUNTRY,
  SELLER_PRIORITIES, CARRIERS, countryForCity,
} from "./constants";
import { parseDate } from "./format";
import type { Address, Booking, ComplianceData, DispatchMode, ExportEvidence, InvoiceData, Item } from "./types";
import { ADDRESS_FIELDS, normaliseAddress } from "./addresses";
import { DISPATCH_LABELS, EVIDENCE_TYPES, INCOTERMS_2020, INVOICE_CURRENCIES, PACKAGE_TYPES } from "./compliance/config";

export class ChangeError extends Error {}

const NUMERIC_BOOKING = new Set(["pallets", "cartons", "declaredValue", "grossWeightKg"]);
const NUMERIC_ITEM = new Set(["quantity", "unitPrice", "unitsPerCarton", "cartons", "unitWeightKg"]);
const INTEGER = new Set(["pallets", "cartons", "quantity", "unitsPerCarton"]);
const TEXT_BOOKING = new Set(["sellerName", "bookingId"]);
const TEXT_ITEM = new Set(["sku", "description", "hsCode"]);

function pick(value: unknown, allowed: readonly string[], label: string): string {
  const s = String(value ?? "").trim().toLowerCase();
  const hit = allowed.find((a) => a.toLowerCase() === s);
  if (!hit) throw new ChangeError(`${label} must be one of: ${allowed.join(", ")}.`);
  return hit;
}

function toNumber(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(String(value).replace(/[£,\s]|kg/gi, ""));
  if (!Number.isFinite(n)) throw new ChangeError(`"${value}" isn't a number.`);
  if (n < 0) throw new ChangeError(`${field} can't be negative.`);
  if (INTEGER.has(field) && !Number.isInteger(n)) throw new ChangeError(`${field} must be a whole number.`);
  return n;
}

function coerceBooking(field: string, value: unknown): unknown {
  if (value === null || value === "") return null;
  if (NUMERIC_BOOKING.has(field)) return toNumber(value, field);
  if (TEXT_BOOKING.has(field)) return String(value).trim();
  switch (field) {
    case "originCity": return pick(value, ORIGIN_CITIES, "Origin city");
    case "originCountry": return pick(value, [ORIGIN_COUNTRY], "Origin country");
    case "destinationCity": return pick(value, DESTINATION_CITIES, "Destination city");
    case "destinationCountry": return pick(value, DESTINATION_COUNTRIES, "Destination country");
    case "destinationType": return pick(value, DESTINATION_TYPES, "Destination type");
    case "sellerPriority": return pick(value, SELLER_PRIORITIES, "Seller priority");
    case "currency": return pick(value, ["GBP"], "Currency");
    case "readyToShipDate": {
      const iso = parseDate(String(value));
      if (!iso) throw new ChangeError(`"${value}" isn't a valid date (use DD-MM-YYYY).`);
      return iso;
    }
    case "deliveryAppointmentBooked": {
      if (typeof value === "boolean") return value;
      const s = String(value).trim().toLowerCase();
      if (["yes", "y", "true"].includes(s)) return true;
      if (["no", "n", "false"].includes(s)) return false;
      throw new ChangeError("Delivery appointment booked must be Yes or No.");
    }
    case "chosenCarrier": {
      const c = CARRIERS.find((x) => x.id === value);
      if (!c) throw new ChangeError("Unknown carrier.");
      return c.id;
    }
  }
  throw new ChangeError(`Unknown booking field "${field}".`);
}

function coerceItem(field: string, value: unknown): unknown {
  if (value === null || value === "") return null;
  if (NUMERIC_ITEM.has(field)) return toNumber(value, field);
  if (field === "hsCode") return String(value).trim();
  if (TEXT_ITEM.has(field)) return String(value).trim();
  if (field === "countryOfOrigin") return pick(value, ITEM_ORIGIN_COUNTRIES, "Country of origin");
  throw new ChangeError(`Unknown item field "${field}".`);
}

/** Shift item-indexed keys down after removing item `removed`. */
function reindex<T>(rec: Record<string, T> | undefined, removed: number, keyIndex: (k: string) => [number, (n: number) => string] | null) {
  if (!rec) return rec;
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(rec)) {
    const hit = keyIndex(k);
    if (!hit) { out[k] = v; continue; }
    const [i, rebuild] = hit;
    if (i === removed) continue;
    out[i > removed ? rebuild(i - 1) : k] = v;
  }
  return out;
}

export interface ChangeResult {
  booking: Booking;
  items: Item[];
  oldValue: unknown;
  newValue: unknown;
}

export function applyChange(booking: Booking, items: Item[], path: string, value: unknown): ChangeResult {
  const b: Booking = structuredClone(booking);
  let its: Item[] = structuredClone(items);
  const parts = path.split(".");

  if (parts[0] === "booking" && parts.length === 2) {
    const field = parts[1] as keyof Booking;
    const v = coerceBooking(field, value);
    const old = b[field];
    (b as unknown as Record<string, unknown>)[field] = v;
    if (field === "destinationCity" && v) b.destinationCountry = countryForCity(v as string);
    if (field === "originCity" && v) b.originCountry = ORIGIN_COUNTRY;
    if (field === "destinationType" && v === "Business address" && b.deliveryAppointmentBooked == null) b.deliveryAppointmentBooked = false;
    return { booking: b, items: its, oldValue: old, newValue: v };
  }

  if ((parts[0] === "collection" || parts[0] === "delivery") && parts.length <= 2) {
    const side = parts[0];
    const old = b[side] ?? null;
    if (parts.length === 1 && value === null) {
      b[side] = null;
      return { booking: b, items: its, oldValue: old, newValue: null };
    }
    // Whole block (booking page form) or a single field (chat) merged into what is already there.
    const merged = parts.length === 1 ? value : { ...(old ?? {}), [parts[1]]: value };
    if (parts.length === 2 && !ADDRESS_FIELDS.some((f) => f.key === parts[1])) throw new ChangeError(`Unknown address field "${parts[1]}".`);
    const r = normaliseAddress(merged);
    if ("errors" in r) throw new ChangeError(r.errors.join(" "));
    b[side] = r.address;
    return { booking: b, items: its, oldValue: parts.length === 2 ? old?.[parts[1] as keyof Address] ?? null : old, newValue: parts.length === 2 ? r.address[parts[1] as keyof Address] ?? null : r.address };
  }

  if (parts[0] === "hazard" && parts.length === 2) {
    const i = Number(parts[1]);
    if (!its[i]) throw new ChangeError("No such item.");
    if (value !== "none" && value !== "contains" && value !== null) throw new ChangeError("Answer must be 'none' or 'contains'.");
    const old = b.hazardConfirmations?.[parts[1]] ?? null;
    b.hazardConfirmations = { ...(b.hazardConfirmations ?? {}) };
    if (value === null) delete b.hazardConfirmations[parts[1]];
    else b.hazardConfirmations[parts[1]] = value;
    return { booking: b, items: its, oldValue: old, newValue: value };
  }

  if (parts[0] === "items") {
    if (parts.length === 1) throw new ChangeError("Bad path.");
    const i = Number(parts[1]);
    if (parts[1] === "new") {
      const item: Item = { sku: null, description: null, hsCode: null, quantity: null, unitPrice: null, unitsPerCarton: null, cartons: null, unitWeightKg: null, countryOfOrigin: null };
      its.push(item);
      return { booking: b, items: its, oldValue: null, newValue: item };
    }
    if (!Number.isInteger(i) || !its[i]) throw new ChangeError("No such item.");
    if (parts.length === 2) {
      if (value !== null) throw new ChangeError("Only removal is supported here.");
      const old = its[i];
      its = its.filter((_, j) => j !== i);
      b.hazardConfirmations = reindex(b.hazardConfirmations, i, (k) => [Number(k), (n) => String(n)]);
      b.hsSuggested = reindex(b.hsSuggested, i, (k) => [Number(k), (n) => String(n)]);
      b.keptOriginal = reindex(b.keptOriginal, i, (k) => {
        const m = k.match(/^(R-\d+):item:(\d+)$/);
        return m ? [Number(m[2]), (n) => `${m[1]}:item:${n}`] : null;
      });
      b.skippedFields = (b.skippedFields ?? []).flatMap((p) => {
        const m = p.match(/^items\.(\d+)\.(.+)$/);
        if (!m) return [p];
        const j = Number(m[1]);
        return j === i ? [] : [j > i ? `items.${j - 1}.${m[2]}` : p];
      });
      return { booking: b, items: its, oldValue: old, newValue: null };
    }
    const field = parts[2] as keyof Item;
    const v = coerceItem(field, value);
    const old = its[i][field];
    (its[i] as unknown as Record<string, unknown>)[field] = v;
    if (field === "description") {
      // A new description needs a fresh HS suggestion and restricted-goods answer.
      if (b.hsSuggested?.[String(i)]) {
        b.hsSuggested = { ...b.hsSuggested };
        delete b.hsSuggested[String(i)];
      }
      if (b.hazardConfirmations?.[String(i)]) {
        b.hazardConfirmations = { ...b.hazardConfirmations };
        delete b.hazardConfirmations[String(i)];
      }
    }
    return { booking: b, items: its, oldValue: old, newValue: v };
  }

  if (parts[0] === "invoice" || parts[0] === "compliance" || parts[0] === "labelNote") return applyDocChange(b, its, parts, value);

  throw new ChangeError(`Unknown path "${path}".`);
}

// ---------- invoice, compliance and label inputs ----------
const INVOICE_TEXT = new Set(["invoiceNumber", "orderReference", "paymentMethod", "incotermPlace", "originStatement"]);
const INVOICE_DATE = new Set(["issueDate", "orderDate", "rateFixedOn"]);
const INVOICE_MONEY = new Set(["discount", "freightCharge", "insuranceCharge"]);
const PARTY_FIELDS = new Set(["name", "address", "postcode", "country", "contactName", "phone", "email"]);
const COMPLIANCE_TEXT = new Set(["exportDeclarationRef", "exportAgent", "classificationCheckedBy", "iossNumber"]);
const COMPLIANCE_DATE = new Set(["goodsSentOn", "paymentReceivedOn", "eurRateDate"]);

const asDate = (v: unknown, label: string) => {
  const iso = parseDate(String(v));
  if (!iso) throw new ChangeError(`${label}: "${v}" isn't a valid date (use DD-MM-YYYY).`);
  return iso;
};
const asBool = (v: unknown, label: string) => {
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["yes", "y", "true"].includes(s)) return true;
  if (["no", "n", "false"].includes(s)) return false;
  throw new ChangeError(`${label} must be Yes or No.`);
};
const asMoney = (v: unknown, label: string) => {
  const n = typeof v === "number" ? v : Number(String(v).replace(/[£€,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new ChangeError(`${label} must be an amount of 0 or more.`);
  return Math.round(n * 100) / 100;
};
const eori = (v: unknown) => String(v).replace(/\s+/g, "").toUpperCase();

function coerceInvoice(field: string, value: unknown): unknown {
  if (value === null || value === "") return null;
  if (INVOICE_TEXT.has(field)) return String(value).trim().slice(0, field === "originStatement" ? 2000 : 200);
  if (INVOICE_DATE.has(field)) return asDate(value, field);
  if (INVOICE_MONEY.has(field)) return asMoney(value, field);
  switch (field) {
    case "incoterm": return pick(value, INCOTERMS_2020, "Incoterm");
    case "currency": return pick(value, INVOICE_CURRENCIES, "Invoice currency");
    case "exchangeRate": {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) throw new ChangeError("Exchange rate must be a positive number (1 GBP = …).");
      return n;
    }
    case "packageType": return pick(value, PACKAGE_TYPES, "Package type");
    case "buyerType": return pick(value, ["B2B", "B2C"], "Buyer type");
    case "exporterEori":
    case "buyerEori": return eori(value);
    case "chamberCertification": return asBool(value, "Chamber certification");
    case "dispatchMode": {
      const s = String(value);
      const hit = (Object.entries(DISPATCH_LABELS) as [DispatchMode, string][]).find(([k, l]) => k === s || l === s);
      if (!hit) throw new ChangeError("Choose who moves the goods out of the UK.");
      return hit[0];
    }
  }
  throw new ChangeError(`Unknown invoice field "${field}".`);
}

function coerceCompliance(field: string, value: unknown): unknown {
  if (value === null || value === "") return null;
  if (COMPLIANCE_TEXT.has(field)) return String(value).trim().slice(0, 200);
  if (COMPLIANCE_DATE.has(field)) return asDate(value, field);
  if (field === "article23Licence") return asBool(value, "Article 23 licence");
  if (field === "eurRate") {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw new ChangeError("EUR rate must be a positive number (EUR per 1 GBP).");
    return n;
  }
  throw new ChangeError(`Unknown compliance field "${field}".`);
}

const emptyCompliance = (): ComplianceData => ({
  exportDeclarationRef: null, exportAgent: null, goodsSentOn: null, paymentReceivedOn: null, evidence: [],
  classificationCheckedBy: null, article23Licence: null, iossNumber: null, eurRate: null, eurRateDate: null,
});

function applyDocChange(b: Booking, its: Item[], parts: string[], value: unknown): ChangeResult {
  if (parts[0] === "labelNote" && parts.length === 1) {
    const old = b.labelNote ?? null;
    b.labelNote = value == null || value === "" ? null : String(value).trim().slice(0, 80);
    return { booking: b, items: its, oldValue: old, newValue: b.labelNote };
  }
  if (parts[0] === "invoice") {
    const inv: Partial<InvoiceData> = { ...(b.invoice ?? {}) };
    if ((parts[1] === "seller" || parts[1] === "buyer") && parts.length === 3) {
      if (!PARTY_FIELDS.has(parts[2])) throw new ChangeError(`Unknown ${parts[1]} field "${parts[2]}".`);
      const party = { ...(inv[parts[1]] ?? {}) } as Record<string, unknown>;
      const old = party[parts[2]] ?? null;
      const v = value == null || value === "" ? null : String(value).trim().slice(0, 200);
      if (parts[2] === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new ChangeError(`"${v}" isn't a valid email address.`);
      party[parts[2]] = v;
      inv[parts[1]] = party as unknown as InvoiceData["seller"];
      b.invoice = inv as InvoiceData;
      return { booking: b, items: its, oldValue: old, newValue: v };
    }
    if (parts.length !== 2) throw new ChangeError("Bad invoice path.");
    const v = coerceInvoice(parts[1], value);
    const old = (inv as Record<string, unknown>)[parts[1]] ?? null;
    (inv as Record<string, unknown>)[parts[1]] = v;
    b.invoice = inv as InvoiceData;
    return { booking: b, items: its, oldValue: old, newValue: v };
  }
  // compliance
  const c: ComplianceData = { ...emptyCompliance(), ...(b.compliance ?? {}) };
  if (parts[1] === "evidence") {
    const list = [...(c.evidence ?? [])];
    if (parts.length === 2) {
      // Add one evidence record.
      const e = value as Partial<ExportEvidence> | null;
      const type = EVIDENCE_TYPES.find((t) => t === e?.type);
      if (!type) throw new ChangeError(`Evidence type must be one of: ${EVIDENCE_TYPES.join(", ")}.`);
      const reference = String(e?.reference ?? "").trim().slice(0, 200);
      if (!reference) throw new ChangeError("Add the evidence reference (for example the airway bill number).");
      const rec: ExportEvidence = { type, reference, obtainedOn: asDate(e?.obtainedOn, "Date obtained") };
      list.push(rec);
      b.compliance = { ...c, evidence: list };
      return { booking: b, items: its, oldValue: null, newValue: rec };
    }
    const i = Number(parts[2]);
    if (parts.length !== 3 || !list[i] || value !== null) throw new ChangeError("No such evidence record.");
    const [old] = list.splice(i, 1);
    b.compliance = { ...c, evidence: list };
    return { booking: b, items: its, oldValue: old, newValue: null };
  }
  if (parts.length !== 2) throw new ChangeError("Bad compliance path.");
  const v = coerceCompliance(parts[1], value);
  const old = (c as unknown as Record<string, unknown>)[parts[1]] ?? null;
  (c as unknown as Record<string, unknown>)[parts[1]] = v;
  b.compliance = c;
  return { booking: b, items: its, oldValue: old, newValue: v };
}

/** Invoice, compliance and label inputs don't change the booking itself, so they don't undo its confirmation. */
export const isDocumentPath = (path: string) => /^(invoice|compliance|labelNote)(\.|$)/.test(path);

const AFFECTS: Record<string, string[]> = {
  "booking.declaredValue": ["R-02"],
  "booking.cartons": ["R-04"],
  "booking.pallets": ["R-05"],
  "booking.grossWeightKg": ["R-05", "R-07"],
  "booking.chosenCarrier": ["R-05"],
  "booking.sellerPriority": ["R-05"],
  "booking.destinationCity": ["R-05"],
  "booking.destinationType": ["R-08"],
  "booking.deliveryAppointmentBooked": ["R-08"],
  "booking.readyToShipDate": ["R-10"],
  hsCode: ["R-01:item"],
  quantity: ["R-02", "R-03:item", "R-07"],
  unitPrice: ["R-02"],
  unitsPerCarton: ["R-03:item"],
  cartons: ["R-03:item", "R-04"],
  description: ["R-06:item"],
  unitWeightKg: ["R-07"],
  countryOfOrigin: ["R-09:item"],
};

/** When a field changes, an earlier "kept original" note on the rules it feeds no longer applies. */
export function clearKeptFor(booking: Booking, path: string): Booking {
  if (!booking.keptOriginal) return booking;
  const m = path.match(/^items\.(\d+)\.(.+)$/);
  const keys = (m ? AFFECTS[m[2]] : AFFECTS[path]) ?? [];
  const kept = { ...booking.keptOriginal };
  for (const k of keys) delete kept[k.endsWith(":item") && m ? `${k}:${m[1]}` : k];
  return { ...booking, keptOriginal: kept };
}
