// Turns the raw rows of the uploaded Bookings and Items sheets into the shared
// data model. Bad values are reported, never silently turned into 0.
import {
  DESTINATION_COUNTRIES, DESTINATION_TYPES, DESTINATION_CITIES, ITEM_ORIGIN_COUNTRIES, ORIGIN_CITIES, SELLER_PRIORITIES,
  countryForCity,
} from "./constants";
import { parseDate } from "./format";
import type { Booking, DataIssue, Item } from "./types";

export type Cell = string | number | boolean | null | undefined;
export type SheetRows = Cell[][];

export interface ImportedBooking {
  booking: Booking;
  items: Item[];
}

export interface ImportResult {
  ok: boolean;
  bookings: ImportedBooking[];
  fileIssues: DataIssue[];
  orphanItems: { row: number; bookingId: string; sku: string | null }[];
  notes: string[];
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();

const BOOKING_COLUMNS: { key: keyof Booking; header: string; aliases?: string[] }[] = [
  { key: "bookingId", header: "Booking ID" },
  { key: "sellerName", header: "Seller name" },
  { key: "originCity", header: "Origin city" },
  { key: "originCountry", header: "Origin country" },
  { key: "destinationCity", header: "Destination city" },
  { key: "destinationCountry", header: "Destination country" },
  { key: "destinationType", header: "Destination type" },
  { key: "readyToShipDate", header: "Ready to ship date", aliases: ["ready-to-ship date", "ready date"] },
  { key: "sellerPriority", header: "Seller priority", aliases: ["priority"] },
  { key: "pallets", header: "Pallets" },
  { key: "cartons", header: "Cartons", aliases: ["total cartons"] },
  { key: "declaredValue", header: "Total declared value", aliases: ["declared value"] },
  { key: "currency", header: "Currency" },
  { key: "grossWeightKg", header: "Total gross weight (kg)", aliases: ["gross weight kg", "total gross weight", "gross weight"] },
  { key: "deliveryAppointmentBooked", header: "Delivery appointment booked", aliases: ["delivery appointment"] },
];

const ITEM_COLUMNS: { key: keyof Item | "bookingId"; header: string; aliases?: string[] }[] = [
  { key: "bookingId", header: "Booking ID" },
  { key: "sku", header: "SKU" },
  { key: "description", header: "Description" },
  { key: "hsCode", header: "HS code" },
  { key: "quantity", header: "Quantity (units)", aliases: ["quantity", "qty"] },
  { key: "unitPrice", header: "Unit price", aliases: ["unit price gbp", "unit price (gbp)"] },
  { key: "unitsPerCarton", header: "Units per carton" },
  { key: "cartons", header: "Cartons" },
  { key: "unitWeightKg", header: "Unit weight (kg)", aliases: ["unit weight"] },
  { key: "countryOfOrigin", header: "Country of origin", aliases: ["origin"] },
];

// The template's grey example rows. Skipped when real data follows, so they don't pollute an audit.
const EXAMPLE_BOOKING = ["BK-001", "Northfield Goods", "Manchester", "United Kingdom", "Frankfurt", "Germany", "Warehouse", "05-11-2026", "Cheapest", 3, 90, 5400, "GBP", 620, "Yes"];
const EXAMPLE_ITEM = ["BK-001", "MUG-01", "Ceramic coffee mug, 350 ml", 691200, 1080, 5, 12, 90, 0.5, "United Kingdom"];

const sameRow = (row: Cell[], ex: Cell[]) => ex.every((v, i) => norm(row[i]) === norm(v));

function findSheet(sheets: Record<string, SheetRows>, word: string, mustHave: string): [string, SheetRows] | null {
  const names = Object.keys(sheets);
  const byName = names.find((n) => norm(n).includes(word));
  if (byName) return [byName, sheets[byName]];
  // Fallback: any sheet whose header row contains a telling column.
  for (const n of names) {
    if (sheets[n].slice(0, 6).some((r) => r?.some((c) => norm(c) === norm(mustHave)))) return [n, sheets[n]];
  }
  return null;
}

function mapHeaders<K extends string>(
  rows: SheetRows,
  cols: { key: K; header: string; aliases?: string[] }[],
): { headerIdx: number; map: Map<K, number>; missing: string[] } | null {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r] ?? [];
    if (!row.some((c) => norm(c) === "booking id")) continue;
    const map = new Map<K, number>();
    const headers = row.map(norm);
    for (const c of cols) {
      const names = [c.header, ...(c.aliases ?? [])].map(norm);
      const idx = headers.findIndex((h) => names.includes(h));
      if (idx >= 0) map.set(c.key, idx);
    }
    return { headerIdx: r, map, missing: cols.filter((c) => !map.has(c.key)).map((c) => c.header) };
  }
  return null;
}

const isBlank = (v: Cell) => v == null || (typeof v === "string" && v.trim() === "");

function text(v: Cell): string | null {
  if (isBlank(v)) return null;
  return String(v).trim();
}

function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  // Excel's day 1 is 1900-01-01 with the 1900 leap-year bug; 25569 = 1970-01-01.
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

interface Ctx {
  issues: DataIssue[];
  row: number;
}

function number(v: Cell, label: string, field: string, ctx: Ctx): number | null {
  if (isBlank(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[£,\s]/g, "").replace(/kg$/i, "");
  const n = Number(cleaned);
  if (cleaned === "" || !Number.isFinite(n)) {
    ctx.issues.push({ level: "error", row: ctx.row, field, message: `Row ${ctx.row}: ${label} "${v}" isn't a number.` });
    return null;
  }
  return n;
}

function oneOf<T extends string>(v: Cell, allowed: readonly T[], label: string, field: string, ctx: Ctx): T | null {
  const t = text(v);
  if (t == null) return null;
  const hit = allowed.find((a) => norm(a) === norm(t));
  if (!hit) {
    ctx.issues.push({ level: "error", row: ctx.row, field, message: `Row ${ctx.row}: ${label} "${t}" isn't allowed (expected ${allowed.join(" / ")}).` });
    return null;
  }
  return hit;
}

function dateCell(v: Cell, ctx: Ctx): string | null {
  if (isBlank(v)) return null;
  const iso = typeof v === "number" ? excelSerialToISO(v) : parseDate(String(v));
  if (!iso) ctx.issues.push({ level: "error", row: ctx.row, field: "booking.readyToShipDate", message: `Row ${ctx.row}: Ready to ship date "${v}" isn't a valid DD-MM-YYYY date.` });
  return iso;
}

function yesNo(v: Cell, ctx: Ctx): boolean | null {
  if (isBlank(v)) return null;
  if (typeof v === "boolean") return v;
  const t = norm(v);
  if (["yes", "y", "true", "1"].includes(t)) return true;
  if (["no", "n", "false", "0"].includes(t)) return false;
  ctx.issues.push({ level: "error", row: ctx.row, field: "booking.deliveryAppointmentBooked", message: `Row ${ctx.row}: Delivery appointment booked "${v}" should be Yes or No.` });
  return null;
}

function hsText(v: Cell): string | null {
  if (isBlank(v)) return null;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

export function importWorkbook(sheets: Record<string, SheetRows>): ImportResult {
  const fileIssues: DataIssue[] = [];
  const notes: string[] = [];
  const fail = (message: string): ImportResult => ({
    ok: false, bookings: [], fileIssues: [...fileIssues, { level: "error", message }], orphanItems: [], notes,
  });

  const bSheet = findSheet(sheets, "booking", "Total declared value");
  const iSheet = findSheet(sheets, "item", "Units per carton");
  if (!bSheet) return fail(`Couldn't find a "Bookings" sheet. Sheets in this file: ${Object.keys(sheets).join(", ") || "none"}.`);
  if (!iSheet) return fail(`Couldn't find an "Items" sheet. Sheets in this file: ${Object.keys(sheets).join(", ")}.`);

  const bMap = mapHeaders(bSheet[1], BOOKING_COLUMNS);
  const iMap = mapHeaders(iSheet[1], ITEM_COLUMNS);
  if (!bMap) return fail(`The "${bSheet[0]}" sheet has no header row with a "Booking ID" column.`);
  if (!iMap) return fail(`The "${iSheet[0]}" sheet has no header row with a "Booking ID" column.`);
  // Origin country is always UK, so we can live without it; everything else is required.
  const bMissing = bMap.missing.filter((h) => h !== "Origin country");
  if (bMissing.length) return fail(`The "${bSheet[0]}" sheet is missing column(s): ${bMissing.join(", ")}.`);
  if (iMap.missing.length) return fail(`The "${iSheet[0]}" sheet is missing column(s): ${iMap.missing.join(", ")}.`);

  const get = <K extends string>(row: Cell[], m: Map<K, number>, k: K): Cell => {
    const idx = m.get(k);
    return idx == null ? null : row[idx];
  };

  // --- Booking rows ---
  let bRows = bSheet[1].slice(bMap.headerIdx + 1).map((row, i) => ({ row: row ?? [], n: bMap.headerIdx + 2 + i }));
  bRows = bRows.filter((r) => r.row.some((c) => !isBlank(c)));
  let iRows = iSheet[1].slice(iMap.headerIdx + 1).map((row, i) => ({ row: row ?? [], n: iMap.headerIdx + 2 + i }));
  iRows = iRows.filter((r) => r.row.some((c) => !isBlank(c)));

  const exampleB = bRows.findIndex((r) => sameRow(r.row, EXAMPLE_BOOKING));
  if (exampleB >= 0 && bRows.length > 1) {
    bRows.splice(exampleB, 1);
    iRows = iRows.filter((r) => !sameRow(r.row, EXAMPLE_ITEM));
    notes.push("Skipped the template's grey example row (BK-001 Northfield Goods).");
  }
  if (bRows.length === 0) return fail(`The "${bSheet[0]}" sheet has no booking rows.`);

  const bookings = new Map<string, ImportedBooking>();
  for (const { row, n } of bRows) {
    const ctx: Ctx = { issues: [], row: n };
    const id = text(get(row, bMap.map, "bookingId"));
    if (!id) {
      fileIssues.push({ level: "error", row: n, message: `Bookings row ${n} has no Booking ID — skipped.` });
      continue;
    }
    if (bookings.has(id)) {
      fileIssues.push({ level: "error", row: n, message: `Booking ID ${id} appears more than once (row ${n}). Only the first row was audited; items can't be linked to duplicates.` });
      continue;
    }
    const destCity = oneOf(get(row, bMap.map, "destinationCity"), DESTINATION_CITIES, "Destination city", "booking.destinationCity", ctx);
    const booking: Booking = {
      bookingId: id,
      sellerName: text(get(row, bMap.map, "sellerName")),
      originCity: oneOf(get(row, bMap.map, "originCity"), ORIGIN_CITIES, "Origin city", "booking.originCity", ctx),
      originCountry: text(get(row, bMap.map, "originCountry")) ?? "United Kingdom",
      destinationCity: destCity,
      destinationCountry:
        oneOf(get(row, bMap.map, "destinationCountry"), DESTINATION_COUNTRIES, "Destination country", "booking.destinationCountry", ctx) ??
        countryForCity(destCity),
      destinationType: oneOf(get(row, bMap.map, "destinationType"), DESTINATION_TYPES, "Destination type", "booking.destinationType", ctx),
      readyToShipDate: dateCell(get(row, bMap.map, "readyToShipDate"), ctx),
      sellerPriority: oneOf(get(row, bMap.map, "sellerPriority"), SELLER_PRIORITIES, "Seller priority", "booking.sellerPriority", ctx),
      pallets: number(get(row, bMap.map, "pallets"), "Pallets", "booking.pallets", ctx),
      cartons: number(get(row, bMap.map, "cartons"), "Cartons", "booking.cartons", ctx),
      declaredValue: number(get(row, bMap.map, "declaredValue"), "Total declared value", "booking.declaredValue", ctx),
      currency: text(get(row, bMap.map, "currency"))?.toUpperCase() ?? null,
      grossWeightKg: number(get(row, bMap.map, "grossWeightKg"), "Total gross weight", "booking.grossWeightKg", ctx),
      deliveryAppointmentBooked: yesNo(get(row, bMap.map, "deliveryAppointmentBooked"), ctx),
      sourceRow: n,
    };
    const required: [keyof Booking, string][] = [
      ["sellerName", "Seller name"], ["originCity", "Origin city"], ["destinationCity", "Destination city"],
      ["destinationType", "Destination type"], ["readyToShipDate", "Ready to ship date"], ["sellerPriority", "Seller priority"],
      ["pallets", "Pallets"], ["cartons", "Cartons"], ["declaredValue", "Total declared value"], ["currency", "Currency"],
      ["grossWeightKg", "Total gross weight"], ["deliveryAppointmentBooked", "Delivery appointment booked"],
    ];
    for (const [k, l] of required) {
      if (booking[k] == null && !ctx.issues.some((x) => x.field === `booking.${k}`))
        ctx.issues.push({ level: "error", row: n, field: `booking.${k}`, message: `Row ${n}: ${l} is blank.` });
    }
    booking.importIssues = ctx.issues;
    bookings.set(id, { booking, items: [] });
  }

  // --- Item rows ---
  const orphanItems: ImportResult["orphanItems"] = [];
  for (const { row, n } of iRows) {
    const ctx: Ctx = { issues: [], row: n };
    const id = text(get(row, iMap.map, "bookingId"));
    const sku = text(get(row, iMap.map, "sku"));
    if (!id || !bookings.has(id)) {
      orphanItems.push({ row: n, bookingId: id ?? "(blank)", sku });
      continue;
    }
    const target = bookings.get(id)!;
    const idx = target.items.length;
    const prefix = (f: string) => `items.${idx}.${f}`;
    const item: Item = {
      sku,
      description: text(get(row, iMap.map, "description")),
      hsCode: hsText(get(row, iMap.map, "hsCode")),
      quantity: number(get(row, iMap.map, "quantity"), "Quantity", prefix("quantity"), ctx),
      unitPrice: number(get(row, iMap.map, "unitPrice"), "Unit price", prefix("unitPrice"), ctx),
      unitsPerCarton: number(get(row, iMap.map, "unitsPerCarton"), "Units per carton", prefix("unitsPerCarton"), ctx),
      cartons: number(get(row, iMap.map, "cartons"), "Cartons", prefix("cartons"), ctx),
      unitWeightKg: number(get(row, iMap.map, "unitWeightKg"), "Unit weight", prefix("unitWeightKg"), ctx),
      countryOfOrigin: oneOf(get(row, iMap.map, "countryOfOrigin"), ITEM_ORIGIN_COUNTRIES, "Country of origin", prefix("countryOfOrigin"), ctx),
      sourceRow: n,
    };
    const required: [keyof Item, string][] = [
      ["sku", "SKU"], ["description", "Description"], ["quantity", "Quantity"], ["unitPrice", "Unit price"],
      ["unitsPerCarton", "Units per carton"], ["cartons", "Cartons"], ["unitWeightKg", "Unit weight"],
    ];
    for (const [k, l] of required) {
      if (item[k] == null && !ctx.issues.some((x) => x.field === prefix(k)))
        ctx.issues.push({ level: "error", row: n, field: prefix(k), message: `Items row ${n} (${sku ?? "no SKU"}): ${l} is blank.` });
    }
    target.items.push(item);
    target.booking.importIssues!.push(...ctx.issues.map((i) => ({ ...i, message: i.message.startsWith("Row") ? `Items ${i.message.charAt(0).toLowerCase()}${i.message.slice(1)}` : i.message })));
  }

  for (const { booking, items } of bookings.values()) {
    if (items.length === 0)
      booking.importIssues!.push({ level: "error", message: `No item rows found for ${booking.bookingId} on the Items sheet.` });
  }
  if (orphanItems.length) {
    fileIssues.push({
      level: "warning",
      message: `${orphanItems.length} item row(s) reference a Booking ID that isn't on the Bookings sheet: ${orphanItems.map((o) => `row ${o.row} (${o.bookingId})`).join(", ")}.`,
    });
  }

  return { ok: true, bookings: [...bookings.values()], fileIssues, orphanItems, notes };
}
