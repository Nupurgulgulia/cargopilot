import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { importWorkbook, type SheetRows } from "@/lib/workbook";
import { buildView } from "@/lib/view";

const NOW = new Date("2026-10-25T11:00:00Z");

function sheetsOf(wb: XLSX.WorkBook): Record<string, SheetRows> {
  return Object.fromEntries(
    wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json<SheetRows[number]>(wb.Sheets[n], { header: 1, raw: true, defval: null })]),
  );
}

const template = () =>
  XLSX.read(fs.readFileSync(path.join(__dirname, "../fixtures/Case2_Shipment_Booking_Test_Data_Format.xlsx")));

const BH = ["Booking ID", "Seller name", "Origin city", "Origin country", "Destination city", "Destination country", "Destination type", "Ready to ship date", "Seller priority", "Pallets", "Cartons", "Total declared value", "Currency", "Total gross weight (kg)", "Delivery appointment booked"];
const IH = ["Booking ID", "SKU", "Description", "HS code", "Quantity (units)", "Unit price", "Units per carton", "Cartons", "Unit weight (kg)", "Country of origin"];

function book(bookings: unknown[][], items: unknown[][]): Record<string, SheetRows> {
  return {
    Bookings: [["Bookings — title"], BH, ...bookings] as SheetRows,
    Items: [["Items — title"], IH, ...items] as SheetRows,
  };
}

describe("workbook import", () => {
  it("reads the real template (example row only) and finds it clean", () => {
    const res = importWorkbook(sheetsOf(template()));
    expect(res.ok).toBe(true);
    expect(res.bookings).toHaveLength(1);
    const { booking, items } = res.bookings[0];
    expect(booking.readyToShipDate).toBe("2026-11-05");
    expect(items[0].hsCode).toBe("691200");
    expect(buildView(booking, items, NOW).readiness).toBe("cleared");
  });

  it("finds planted errors and isolates them to the right booking", () => {
    const res = importWorkbook(
      book(
        [
          ["BK-001", "Northfield Goods", "Manchester", "United Kingdom", "Frankfurt", "Germany", "Warehouse", "05-11-2026", "Cheapest", 3, 90, 5400, "GBP", 620, "Yes"],
          ["BK-101", "Acme", "London", "United Kingdom", "Paris", "France", "Warehouse", "01-10-2026", "Fastest", 2, 50, 4000, "GBP", 1000, "No"],
          ["BK-102", "Beta", "Leeds", "United Kingdom", "Amsterdam", "Netherlands", "Business address", "10-12-2026", "Balanced", 1, 20, 1000, "GBP", 300, "No"],
        ],
        [
          ["BK-001", "MUG-01", "Ceramic coffee mug, 350 ml", 691200, 1080, 5, 12, 90, 0.5, "United Kingdom"],
          ["BK-101", "PB-1", "Lithium power bank", 85076, 500, 10, 10, 45, 0.3, null],
          ["BK-102", "TEE-1", "Cotton t-shirt", 610910, 200, 5, 10, 20, 0.2, "India"],
          ["BK-999", "X", "Orphan", 123456, 1, 1, 1, 1, 1, "China"],
        ],
      ),
    );
    expect(res.ok).toBe(true);
    // Example row skipped because real rows follow.
    expect(res.bookings.map((b) => b.booking.bookingId)).toEqual(["BK-101", "BK-102"]);
    expect(res.orphanItems).toHaveLength(1);

    const v101 = buildView(res.bookings[0].booking, res.bookings[0].items, NOW);
    const failed = [...new Set(v101.results.filter((r) => r.status === "fail").map((r) => r.ruleId))].sort();
    // R-01 short HS, R-02 4000 vs 5000, R-03 10×45≠500, R-04 50≠45, R-05 500kg/pallet > C's 400, R-06 lithium, R-08 no appt, R-09 blank, R-10 past
    expect(failed).toEqual(["R-01", "R-02", "R-03", "R-04", "R-05", "R-06", "R-08", "R-09", "R-10"]);
    expect(v101.readiness).toBe("grounded");

    const v102 = buildView(res.bookings[1].booking, res.bookings[1].items, NOW);
    expect(v102.readiness).toBe("cleared");
  });

  it("reports bad cells instead of turning them into zero", () => {
    const res = importWorkbook(
      book(
        [["BK-1", "S", "London", "United Kingdom", "Berlin", "Germany", "Warehouse", "31-02-2026", "Cheapest", "two", 10, 100, "GBP", 100, "Maybe"]],
        [["BK-1", "A", "Thing", 123456, 10, 10, 1, 10, 1, "China"]],
      ),
    );
    const b = res.bookings[0].booking;
    expect(b.pallets).toBeNull();
    expect(b.readyToShipDate).toBeNull();
    expect(b.deliveryAppointmentBooked).toBeNull();
    expect(b.importIssues!.map((i) => i.message).join(" ")).toMatch(/Pallets "two" isn't a number/);
    expect(buildView(b, res.bookings[0].items, NOW).results.find((r) => r.ruleId === "R-05")!.status).toBe("not_evaluable");
  });

  it("names a missing column", () => {
    const sheets = book([], []);
    sheets.Bookings[1] = BH.filter((h) => h !== "Pallets");
    const res = importWorkbook(sheets);
    expect(res.ok).toBe(false);
    expect(res.fileIssues[0].message).toContain("Pallets");
  });

  it("sample workbook: each booking breaks exactly the rules it was built to break", () => {
    const wb = XLSX.read(fs.readFileSync(path.join(__dirname, "../public/samples/cargopilot-sample-audit.xlsx")));
    const res = importWorkbook(sheetsOf(wb));
    const broken = Object.fromEntries(
      res.bookings.map(({ booking, items }) => {
        const v = buildView(booking, items, NOW);
        return [booking.bookingId, [...new Set(v.results.filter((r) => r.status === "fail" || r.status === "review").map((r) => r.ruleId))].sort().join(",")];
      }),
    );
    expect(broken).toEqual({
      "SA-01": "",
      "SA-02": "R-02",
      "SA-03": "R-03,R-04",
      "SA-04": "R-05",
      "SA-05": "R-06",
      "SA-06": "R-01,R-07,R-09",
      "SA-07": "R-08,R-10",
      "SA-08": "R-01",
    });
    expect(res.orphanItems.map((o) => o.bookingId)).toEqual(["SA-99"]);
    expect(res.notes[0]).toMatch(/example row/);
  });

  it("reads the Bookings and Items sheets uploaded as two CSV files, keeping HS leading zeros", () => {
    // Same parsing the upload page uses for CSV: every value stays text.
    const csv = (text: string) => {
      const wb = XLSX.read(text, { type: "string", raw: true });
      return XLSX.utils.sheet_to_json<SheetRows[number]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false });
    };
    const res = importWorkbook({
      "bookings.csv / Sheet1": csv(`${BH.join(",")}\nBK-7,Bean Co,London,United Kingdom,Berlin,Germany,Business address,15-12-2026,Cheapest,1,10,"1,000",GBP,60,No`),
      "items.csv / Sheet1": csv(`${IH.join(",")}\nBK-7,COF-1,Roasted coffee beans,090121,100,10,10,10,0.5,India`),
    });
    expect(res.ok).toBe(true);
    const { booking, items } = res.bookings[0];
    expect(items[0].hsCode).toBe("090121");
    expect(booking.declaredValue).toBe(1000);
    expect(buildView(booking, items, NOW).readiness).toBe("cleared");
  });

  it("reads Excel date serials", () => {
    const res = importWorkbook(
      book(
        [["BK-1", "S", "London", "United Kingdom", "Berlin", "Germany", "Warehouse", 46331, "Cheapest", 1, 1, 10, "GBP", 10, "Yes"]],
        [["BK-1", "A", "Thing", 123456, 1, 10, 1, 1, 1, "China"]],
      ),
    );
    expect(res.bookings[0].booking.readyToShipDate).toBe("2026-11-05");
  });
});
