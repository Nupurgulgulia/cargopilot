// Applies one field change to a booking. Every change goes through here —
// Error Detective fixes, chat updates and manual edits — so values are always
// coerced and validated the same way.
import {
  DESTINATION_COUNTRIES, DESTINATION_TYPES, DESTINATION_CITIES, ITEM_ORIGIN_COUNTRIES, ORIGIN_CITIES, ORIGIN_COUNTRY,
  SELLER_PRIORITIES, CARRIERS, countryForCity,
} from "./constants";
import { parseDate } from "./format";
import type { Booking, Item } from "./types";

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
      // A new description needs a fresh restricted-goods answer.
      if (b.hazardConfirmations?.[String(i)]) {
        b.hazardConfirmations = { ...b.hazardConfirmations };
        delete b.hazardConfirmations[String(i)];
      }
    }
    return { booking: b, items: its, oldValue: old, newValue: v };
  }

  throw new ChangeError(`Unknown path "${path}".`);
}

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
