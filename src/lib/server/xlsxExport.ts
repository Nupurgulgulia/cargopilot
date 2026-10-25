import "server-only";
import ExcelJS from "exceljs";
import { buildExport, originalSheets, SHEET_NAMES, type SheetModel } from "../exportModel";
import type { UploadExport } from "./exportData";

const NAVY = "FF0B1B33";
const GROUP = "FFE6F4F2";
const CHANGED = "FFFFF3B0";

function addSheet(wb: ExcelJS.Workbook, m: SheetModel) {
  const ws = wb.addWorksheet(m.name);
  m.rows.forEach((r) => ws.addRow(r));
  m.widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (const r of m.headerRows) {
    ws.getRow(r + 1).eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    });
  }
  for (const r of m.groupRows) {
    const row = ws.getRow(r + 1);
    for (let c = 1; c <= m.widths.length; c++) {
      const cell = row.getCell(c);
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP } };
    }
  }
  for (const [r, c] of m.changed) {
    ws.getRow(r + 1).getCell(c + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CHANGED } };
  }
  const header = m.headerRows[0];
  if (header != null) ws.views = [{ state: "frozen", ySplit: header + 1 }];
  if (m.name === SHEET_NAMES.changes) ws.getRow(1).font = { bold: true, size: 13 };
}

/** The uploaded workbook, untouched, plus the CargoPilot sheets. */
export async function updatedWorkbook(data: UploadExport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  let haveOriginal = false;
  if (data.originalFile) {
    try {
      await wb.xlsx.load(data.originalFile as unknown as ArrayBuffer);
      haveOriginal = true;
    } catch (e) {
      console.error("could not reopen original workbook", e);
    }
  }
  if (!haveOriginal) for (const s of originalSheets(data.bookings)) addSheet(wb, s);
  for (const name of Object.values(SHEET_NAMES)) {
    const existing = wb.getWorksheet(name);
    if (existing) wb.removeWorksheet(existing.id);
  }
  for (const s of buildExport(data.bookings, data.events)) addSheet(wb, s);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
