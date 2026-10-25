// Builds public/samples/cargopilot-sample-audit.xlsx from the Case 2 template with planted errors.
import * as XLSX from "xlsx";
import fs from "fs";

const wb = XLSX.read(fs.readFileSync("fixtures/Case2_Shipment_Booking_Test_Data_Format.xlsx"));
const bookings = [
  // id, seller, origin city, origin country, dest city, dest country, type, date, priority, pallets, cartons, declared, ccy, gross, appt
  ["SA-01", "Brightwear Ltd", "London", "United Kingdom", "Berlin", "Germany", "Warehouse", "15-12-2026", "Cheapest", 1, 20, 2000, "GBP", 130, "Yes"],
  ["SA-02", "Potter & Co", "Manchester", "United Kingdom", "Frankfurt", "Germany", "Warehouse", "20-11-2026", "Cheapest", 3, 100, 4500, "GBP", 620, "Yes"],
  ["SA-03", "Carry Goods", "Manchester", "United Kingdom", "Paris", "France", "Business address", "01-12-2026", "Balanced", 2, 55, 3600, "GBP", 400, "No"],
  ["SA-04", "Tile Republic", "Birmingham", "United Kingdom", "Hamburg", "Germany", "Warehouse", "28-11-2026", "Fastest", 2, 40, 3000, "GBP", 1000, "Yes"],
  ["SA-05", "Gadget Hub", "Leeds", "United Kingdom", "Amsterdam", "Netherlands", "Business address", "10-12-2026", "Most reliable", 1, 20, 3900, "GBP", 150, "No"],
  ["SA-06", "Glow Home", "London", "United Kingdom", "Lyon", "France", "Warehouse", "05-01-2027", "Cheapest", 2, 50, 2400, "GBP", 600, "Yes"],
  ["SA-07", "Paper Lane", "Manchester", "United Kingdom", "Rotterdam", "Netherlands", "Warehouse", "10-10-2026", "Balanced", 2, 40, 2400, "GBP", 560, "No"],
  ["SA-08", "Northfield Goods", "Leeds", "United Kingdom", "Berlin", "Germany", "Business address", "18-12-2026", "Cheapest", 1, 30, 1500, "GBP", 260, "No"],
];
const items = [
  // booking, sku, description, hs, qty, unit price, units/carton, cartons, unit kg, origin
  ["SA-01", "TEE-BLK", "Organic cotton t-shirt, black", 610910, 500, 4, 25, 20, 0.2, "India"],
  ["SA-02", "MUG-01", "Ceramic coffee mug, 350 ml", 691200, 1000, 5, 10, 100, 0.5, "China"],
  ["SA-03", "BAG-TOTE", "Canvas tote bag", 420222, 600, 3, 24, 20, 0.3, "Vietnam"],
  ["SA-03", "BOX-LUNCH", "Plastic lunch box", 392410, 300, 6, 10, 30, 0.5, "Turkey"],
  ["SA-04", "TILE-WHT", "Glazed ceramic wall tile 20x20", 690721, 2000, 1.5, 50, 40, 0.4, "Turkey"],
  ["SA-05", "PB-10K", "Lithium-ion power bank 10000mAh", 850760, 200, 12, 20, 10, 0.25, "China"],
  ["SA-05", "SPK-MINI", "Bluetooth mini speaker", 851822, 100, 15, 10, 10, 0.6, "China"],
  ["SA-06", "JAR-CNDL", "Glass candle jar, empty", 7013, 1200, 2, 24, 50, 0.6, null],
  ["SA-07", "NB-A5", "A5 lined notebook", 482010, 2000, 1.2, 50, 40, 0.25, "United Kingdom"],
  ["SA-08", "SCARF-W", "Wool scarf", null, 300, 5, 10, 30, 0.3, "Germany"],
  ["SA-99", "GHOST-1", "Item for a booking that doesn't exist", 123456, 10, 1, 10, 1, 0.1, "China"],
];
XLSX.utils.sheet_add_aoa(wb.Sheets["Bookings"], bookings, { origin: "A4" });
XLSX.utils.sheet_add_aoa(wb.Sheets["Items"], items, { origin: "A4" });
XLSX.writeFile(wb, "public/samples/cargopilot-sample-audit.xlsx");
console.log("wrote sample");
