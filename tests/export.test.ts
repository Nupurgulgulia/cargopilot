import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { applyChange } from "@/lib/changes";
import { buildExport, SHEET_NAMES, type ExportBooking, type ExportEvent } from "@/lib/exportModel";
import { importWorkbook, type SheetRows } from "@/lib/workbook";
import { updatedWorkbook } from "@/lib/server/xlsxExport";

const NOW = new Date("2026-10-25T11:00:00Z");
const file = fs.readFileSync(path.join(__dirname, "../public/samples/cargopilot-sample-audit.xlsx"));

function setup() {
  const wb = XLSX.read(file);
  const sheets = Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json<SheetRows[number]>(wb.Sheets[n], { header: 1, raw: true, defval: null })]));
  const res = importWorkbook(sheets);
  const bookings: ExportBooking[] = res.bookings.map((b) => ({ ...b, original: structuredClone(b) }));
  const events: ExportEvent[] = [];
  const edit = (bookingId: string, p: string, value: unknown, action: ExportEvent["action"] = "accepted_fix", ruleId: string | null = null) => {
    const i = bookings.findIndex((b) => b.booking.bookingId === bookingId);
    const r = applyChange(bookings[i].booking, bookings[i].items, p, value);
    bookings[i] = { ...bookings[i], booking: r.booking, items: r.items };
    events.push({ bookingIndex: i, path: p, oldValue: r.oldValue, newValue: r.newValue, action, ruleId, at: new Date(NOW.getTime() + events.length * 60000).toISOString() });
  };
  edit("SA-02", "booking.declaredValue", 5000, "accepted_fix", "R-02");
  edit("SA-03", "items.0.cartons", 25, "accepted_fix", "R-03");
  edit("SA-05", "items.0", null, "accepted_fix", "R-06");
  return { bookings, events };
}

describe("updated workbook export", () => {
  it("groups every change under its Booking ID with the booking's status", () => {
    const { bookings, events } = setup();
    const [changes, bSheet, iSheet] = buildExport(bookings, events, NOW);
    const rowsFor = (id: string) => changes.rows.filter((r) => r[0] === id);

    // SA-03: group row + its change row, both carrying the Booking ID.
    const sa03 = rowsFor("SA-03");
    expect(sa03).toHaveLength(2);
    expect(String(sa03[0][1])).toContain("Status: Cleared for Dispatch (was Grounded)");
    expect(sa03[1].slice(2, 9)).toEqual(["Items", 6, "Cartons (BAG-TOTE)", 20, 25, "Accepted suggested fix", "R-03"]);

    // Bookings without edits still appear, so every booking is in one place.
    expect(rowsFor("SA-01")[1][4]).toBe("No changes made in CargoPilot");

    // Corrected sheets highlight what changed.
    const sa02Row = bSheet.rows.findIndex((r) => r[0] === "SA-02");
    expect(bSheet.changed).toContainEqual([sa02Row, 11]); // Total declared value column
    expect(iSheet.rows.some((r) => r[r.length - 1] === "Removed in CargoPilot")).toBe(true);
  });

  it("keeps the original sheets untouched and adds the CargoPilot sheets", async () => {
    const { bookings, events } = setup();
    const buf = await updatedWorkbook({ id: "x", fileName: "s.xlsx", originalFile: file, googleSheetId: null, bookings, events });
    const out = XLSX.read(buf);
    expect(out.SheetNames).toEqual(expect.arrayContaining(["Bookings", "Items", "Carrier options", ...Object.values(SHEET_NAMES)]));
    const before = XLSX.utils.sheet_to_json(XLSX.read(file).Sheets["Bookings"], { header: 1, raw: true, blankrows: false });
    const after = XLSX.utils.sheet_to_json(out.Sheets["Bookings"], { header: 1, raw: true, blankrows: false });
    expect(after).toEqual(before);
  });

  it("rebuilds original sheets when the uploaded file wasn't kept", async () => {
    const { bookings, events } = setup();
    const out = XLSX.read(await updatedWorkbook({ id: "x", fileName: "s.xlsx", originalFile: null, googleSheetId: null, bookings, events }));
    expect(out.SheetNames.slice(0, 2)).toEqual(["Bookings", "Items"]);
  });
});

describe("Google Sheet links", () => {
  it("reads the sheet id from the common link shapes", async () => {
    process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test"; // module opens a (lazy) client on import
    const { parseSheetId } = await import("@/lib/server/googleSync");
    const id = "1HE34NcA-L-K2ZGFvq0n3MiYbVW_8QpdVRrB1JjgXpqA";
    expect(parseSheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)).toBe(id);
    expect(parseSheetId(`https://docs.google.com/spreadsheets/u/0/d/${id}/edit?fromCopy=true`)).toBe(id);
    expect(parseSheetId(id)).toBe(id);
    expect(parseSheetId("https://example.com/not-a-sheet")).toBeNull();
  });
});
