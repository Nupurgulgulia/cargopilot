// Builds the sheets that describe what changed in CargoPilot, grouped by Booking ID.
// Pure data so the Excel download and the Google Sheets sync render exactly the same thing.
import { CARRIERS } from "./constants";
import { carrierLabel } from "./carriers";
import { isoToDisplay } from "./format";
import type { Booking, Item, Readiness } from "./types";
import { buildView } from "./view";
import { BOOKING_COLUMNS, ITEM_COLUMNS } from "./workbook";

export type CellValue = string | number;

export interface SheetModel {
  name: string;
  rows: CellValue[][];
  /** Header rows (bold, navy). */
  headerRows: number[];
  /** Booking group rows (bold, tinted). */
  groupRows: number[];
  /** Individual cells to highlight as changed: [row, col]. */
  changed: [number, number][];
  widths: number[];
}

export interface ExportBooking {
  booking: Booking;
  items: Item[];
  original: { booking: Booking; items: Item[] } | null;
}

export interface ExportEvent {
  bookingIndex: number;
  path: string;
  oldValue: unknown;
  newValue: unknown;
  action: "accepted_fix" | "manual_edit" | "chat_update" | "kept_original";
  ruleId: string | null;
  at: string;
}

export const SHEET_NAMES = {
  changes: "CargoPilot Changes",
  bookings: "Bookings (corrected)",
  items: "Items (corrected)",
} as const;

const READINESS_LABEL: Record<Readiness, string> = {
  grounded: "Grounded",
  attention: "Needs Attention",
  cleared: "Cleared for Dispatch",
};

const HOW: Record<ExportEvent["action"], string> = {
  accepted_fix: "Accepted suggested fix",
  manual_edit: "Edited in app",
  chat_update: "Changed in chat",
  kept_original: "Kept as is",
};

const ukTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });

/** A field value as it would be written in the template. */
export function cellFor(key: string, v: unknown): CellValue {
  if (v == null || v === "") return "";
  if (key === "readyToShipDate" && typeof v === "string") return isoToDisplay(v);
  if (key === "deliveryAppointmentBooked") return v ? "Yes" : "No";
  if (key === "chosenCarrier") {
    const c = CARRIERS.find((x) => x.id === v);
    return c ? carrierLabel(c) : String(v);
  }
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

const bookingHeader = (key: string) => BOOKING_COLUMNS.find((c) => c.key === key)?.header;
const itemHeader = (key: string) => ITEM_COLUMNS.find((c) => c.key === key)?.header;

function describeEvent(e: ExportEvent, b: ExportBooking) {
  const p = e.path.split(".");
  const itemAt = (i: number) => b.items[i] ?? b.original?.items[i];
  if (p[0] === "booking") {
    const header = bookingHeader(p[1]);
    return {
      sheet: header ? "Bookings" : "—",
      row: header ? b.booking.sourceRow ?? "" : "",
      field: header ?? (p[1] === "chosenCarrier" ? "Chosen carrier (CargoPilot)" : p[1]),
      from: cellFor(p[1], e.oldValue),
      to: cellFor(p[1], e.newValue),
    };
  }
  if (p[0] === "items" && p.length === 3) {
    const it = itemAt(Number(p[1]));
    return {
      sheet: "Items",
      row: it?.sourceRow ?? "",
      field: `${itemHeader(p[2]) ?? p[2]}${it?.sku ? ` (${it.sku})` : ""}`,
      from: cellFor(p[2], e.oldValue),
      to: cellFor(p[2], e.newValue),
    };
  }
  if (p[0] === "items" && p.length === 2) {
    const old = e.oldValue as Item | null;
    return {
      sheet: "Items",
      row: old?.sourceRow ?? "",
      field: "Item removed",
      from: old ? `${old.sku ?? ""} ${old.description ?? ""}`.trim() : "",
      to: "(removed)",
    };
  }
  if (p[0] === "hazard") {
    const it = itemAt(Number(p[1]));
    const word = (v: unknown) => (v === "none" ? "No restricted goods" : v === "contains" ? "Contains restricted goods" : "");
    return {
      sheet: "Items",
      row: it?.sourceRow ?? "",
      field: `Restricted-goods answer${it?.sku ? ` (${it.sku})` : ""}`,
      from: word(e.oldValue),
      to: word(e.newValue),
    };
  }
  return { sheet: "", row: "", field: e.path, from: cellFor("", e.oldValue), to: cellFor("", e.newValue) };
}

export function buildExport(bookings: ExportBooking[], events: ExportEvent[], now = new Date()): SheetModel[] {
  const views = bookings.map((b) => buildView(b.booking, b.items, now));
  const originalViews = bookings.map((b) => (b.original ? buildView(b.original.booking, b.original.items, now) : null));
  const fieldEdits = events.filter((e) => e.action !== "kept_original");

  // ---- Changes, grouped by Booking ID ----
  const changes: SheetModel = {
    name: SHEET_NAMES.changes,
    rows: [
      ["CargoPilot Changes — every edit made in CargoPilot, grouped by Booking ID. Your original sheets are not changed."],
      ["Last updated (UK)", ukTime(now.toISOString())],
      [],
      ["Booking ID", "When (UK)", "Sheet", "Row", "Field", "Original value", "New value", "How", "Rule"],
    ],
    headerRows: [3],
    groupRows: [],
    changed: [],
    widths: [14, 20, 12, 7, 36, 26, 26, 22, 8],
  };
  bookings.forEach((b, i) => {
    const mine = fieldEdits.filter((e) => e.bookingIndex === i).sort((x, y) => x.at.localeCompare(y.at));
    const now_ = READINESS_LABEL[views[i].readiness];
    const was = originalViews[i] ? READINESS_LABEL[originalViews[i]!.readiness] : null;
    const status = was && was !== now_ ? `Status: ${now_} (was ${was})` : `Status: ${now_}`;
    const bk = b.booking;
    changes.groupRows.push(changes.rows.length);
    changes.rows.push([
      bk.bookingId ?? "",
      [bk.sellerName, `${bk.originCity ?? "?"} → ${bk.destinationCity ?? "?"}`, status, `${mine.length} change${mine.length === 1 ? "" : "s"}`]
        .filter(Boolean)
        .join(" · "),
    ]);
    if (mine.length === 0) changes.rows.push([bk.bookingId ?? "", "", "", "", "No changes made in CargoPilot"]);
    for (const e of mine) {
      const d = describeEvent(e, b);
      changes.rows.push([bk.bookingId ?? "", ukTime(e.at), d.sheet, d.row, d.field, d.from, d.to, HOW[e.action], e.ruleId ?? ""]);
    }
  });

  // ---- Bookings (corrected) ----
  const bCols = BOOKING_COLUMNS;
  const bookingsSheet: SheetModel = {
    name: SHEET_NAMES.bookings,
    rows: [[...bCols.map((c) => c.header), "CargoPilot status", "Chosen carrier", "Changes made"]],
    headerRows: [0],
    groupRows: [],
    changed: [],
    widths: [...bCols.map((c) => Math.max(12, c.header.length + 2)), 22, 26, 14],
  };
  bookings.forEach((b, i) => {
    const r = bookingsSheet.rows.length;
    const row: CellValue[] = bCols.map((c) => cellFor(c.key, b.booking[c.key]));
    bCols.forEach((c, col) => {
      if (b.original && cellFor(c.key, b.original.booking[c.key]) !== row[col]) bookingsSheet.changed.push([r, col]);
    });
    const carrier = views[i].carriers.selected && views[i].carriers.selected!.eligible !== false ? views[i].carriers.selected : views[i].carriers.recommended;
    row.push(READINESS_LABEL[views[i].readiness], carrier ? carrierLabel(carrier.carrier) : "", fieldEdits.filter((e) => e.bookingIndex === i).length);
    if (b.booking.chosenCarrier) bookingsSheet.changed.push([r, bCols.length + 1]);
    bookingsSheet.rows.push(row);
  });

  // ---- Items (corrected) ----
  const iCols = ITEM_COLUMNS;
  const itemsSheet: SheetModel = {
    name: SHEET_NAMES.items,
    rows: [[...iCols.map((c) => c.header), "CargoPilot note"]],
    headerRows: [0],
    groupRows: [],
    changed: [],
    widths: [...iCols.map((c) => Math.max(12, c.header.length + 2)), 24],
  };
  const itemCells = (bookingId: string | null, it: Item) =>
    iCols.map((c) => (c.key === "bookingId" ? bookingId ?? "" : cellFor(c.key, it[c.key as keyof Item])));
  bookings.forEach((b) => {
    const origItems = b.original?.items ?? [];
    for (const it of b.items) {
      const r = itemsSheet.rows.length;
      const row = itemCells(b.booking.bookingId, it);
      const orig = it.sourceRow != null ? origItems.find((o) => o.sourceRow === it.sourceRow) : undefined;
      if (orig) {
        const origRow = itemCells(b.booking.bookingId, orig);
        row.forEach((v, col) => {
          if (v !== origRow[col]) itemsSheet.changed.push([r, col]);
        });
      }
      itemsSheet.rows.push([...row, orig || !b.original ? "" : "Added in CargoPilot"]);
    }
    for (const orig of origItems) {
      if (b.items.some((it) => it.sourceRow != null && it.sourceRow === orig.sourceRow)) continue;
      const r = itemsSheet.rows.length;
      const row = itemCells(b.booking.bookingId, orig);
      row.forEach((_, col) => itemsSheet.changed.push([r, col]));
      itemsSheet.rows.push([...row, "Removed in CargoPilot"]);
    }
  });

  return [changes, bookingsSheet, itemsSheet];
}

/** Original Bookings/Items sheets rebuilt from stored data, for audits uploaded before the file was kept. */
export function originalSheets(bookings: ExportBooking[]): SheetModel[] {
  const src = bookings.map((b) => b.original ?? { booking: b.booking, items: b.items });
  return [
    {
      name: "Bookings",
      rows: [BOOKING_COLUMNS.map((c) => c.header), ...src.map((s) => BOOKING_COLUMNS.map((c) => cellFor(c.key, s.booking[c.key])))],
      headerRows: [0], groupRows: [], changed: [], widths: BOOKING_COLUMNS.map((c) => Math.max(12, c.header.length + 2)),
    },
    {
      name: "Items",
      rows: [
        ITEM_COLUMNS.map((c) => c.header),
        ...src.flatMap((s) => s.items.map((it) => ITEM_COLUMNS.map((c) => (c.key === "bookingId" ? s.booking.bookingId ?? "" : cellFor(c.key, it[c.key as keyof Item]))))),
      ],
      headerRows: [0], groupRows: [], changed: [], widths: ITEM_COLUMNS.map((c) => Math.max(12, c.header.length + 2)),
    },
  ];
}
