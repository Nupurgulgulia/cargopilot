import "server-only";
import { JWT } from "google-auth-library";
import * as XLSX from "xlsx";
import { buildExport, originalSheets, type CellValue, type SheetModel } from "../exportModel";
import { sql } from "./db";
import { loadUploadExport, type UploadExport } from "./exportData";

// Live sync of an audit's CargoPilot sheets into a Google Sheet, via a service account.
// The user shares their sheet with the service account's email as Editor.

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const sa = JSON.parse(json) as ServiceAccount;
    return sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

export const serviceAccountEmail = () => serviceAccount()?.client_email ?? null;

export class SheetError extends Error {}

export function parseSheetId(input: string): string | null {
  // Accepts /spreadsheets/d/ID and account-scoped links like /spreadsheets/u/0/d/ID, or a bare ID.
  const m = input.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]{20,})/) ?? input.trim().match(/^([a-zA-Z0-9-_]{20,})$/);
  return m ? m[1] : null;
}

async function api(sheetId: string, path: string, init?: { method?: string; body?: unknown }) {
  const sa = serviceAccount();
  if (!sa) throw new SheetError("Google Sheets sync isn't set up on this server yet.");
  const jwt = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const { token } = await jwt.getAccessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 403 || res.status === 404) {
    throw new SheetError(`CargoPilot can't open that sheet. Share it with ${sa.client_email} as Editor, then try again.`);
  }
  if (!res.ok) {
    const text = await res.text();
    // An .xlsx stored in Drive opens in Sheets but can't be edited through the Sheets API.
    if (/Office file/i.test(text)) {
      throw new SheetError(
        "That link is an Excel (.xlsx) file stored in Google Drive, which Google doesn't let apps edit. Open it, choose File → Save as Google Sheets, share the new sheet with " +
          `${sa.client_email} as Editor, and paste the new link here.`,
      );
    }
    let message = text.slice(0, 200);
    try {
      message = JSON.parse(text).error?.message ?? message;
    } catch {}
    throw new SheetError(`Google Sheets couldn't complete that (${res.status}): ${message}`);
  }
  return res.json();
}

type SheetProps = { sheetId: number; title: string };

async function tabs(sheetId: string): Promise<SheetProps[]> {
  const meta = await api(sheetId, "?fields=sheets.properties(sheetId,title)");
  return (meta.sheets ?? []).map((s: { properties: SheetProps }) => s.properties);
}

async function ensureTabs(sheetId: string, titles: string[]): Promise<Map<string, number>> {
  let existing = await tabs(sheetId);
  const missing = titles.filter((t) => !existing.some((e) => e.title === t));
  if (missing.length) {
    await api(sheetId, ":batchUpdate", { method: "POST", body: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) } });
    existing = await tabs(sheetId);
  }
  return new Map(existing.map((e) => [e.title, e.sheetId]));
}

const rgb = (hex: string) => ({
  red: parseInt(hex.slice(0, 2), 16) / 255,
  green: parseInt(hex.slice(2, 4), 16) / 255,
  blue: parseInt(hex.slice(4, 6), 16) / 255,
});

function formatRequests(gid: number, m: SheetModel) {
  const width = Math.max(m.widths.length, ...m.rows.map((r) => r.length));
  const band = (row: number, fmt: object, fields: string) => ({
    repeatCell: { range: { sheetId: gid, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 0, endColumnIndex: width }, cell: { userEnteredFormat: fmt }, fields },
  });
  return [
    // Reset previous formatting so highlights never go stale.
    { repeatCell: { range: { sheetId: gid }, cell: { userEnteredFormat: {} }, fields: "userEnteredFormat" } },
    ...m.headerRows.map((r) =>
      band(r, { backgroundColor: rgb("0b1b33"), textFormat: { bold: true, foregroundColor: rgb("ffffff") } }, "userEnteredFormat(backgroundColor,textFormat)"),
    ),
    ...m.groupRows.map((r) => band(r, { backgroundColor: rgb("e6f4f2"), textFormat: { bold: true } }, "userEnteredFormat(backgroundColor,textFormat)")),
    ...m.changed.map(([r, c]) => ({
      repeatCell: {
        range: { sheetId: gid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: c, endColumnIndex: c + 1 },
        cell: { userEnteredFormat: { backgroundColor: rgb("fff3b0") } },
        fields: "userEnteredFormat.backgroundColor",
      },
    })),
    {
      updateSheetProperties: {
        properties: { sheetId: gid, gridProperties: { frozenRowCount: m.headerRows.length ? m.headerRows[0] + 1 : 0 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    ...m.widths.map((w, i) => ({
      updateDimensionProperties: {
        range: { sheetId: gid, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: Math.round(w * 7.5) },
        fields: "pixelSize",
      },
    })),
  ];
}

async function writeSheets(sheetId: string, models: SheetModel[], format = true) {
  const ids = await ensureTabs(sheetId, models.map((m) => m.name));
  const q = (name: string) => `'${name.replace(/'/g, "''")}'`;
  await api(sheetId, "/values:batchClear", { method: "POST", body: { ranges: models.map((m) => q(m.name)) } });
  await api(sheetId, "/values:batchUpdate", {
    method: "POST",
    body: { valueInputOption: "RAW", data: models.map((m) => ({ range: `${q(m.name)}!A1`, values: m.rows.map((r) => r.map((c) => c ?? "")) })) },
  });
  if (format) {
    await api(sheetId, ":batchUpdate", { method: "POST", body: { requests: models.flatMap((m) => formatRequests(ids.get(m.name)!, m)) } });
  }
}

/** The original Bookings/Items rows, from the kept file when we have it. */
function originalModels(data: UploadExport): SheetModel[] {
  if (data.originalFile) {
    try {
      const wb = XLSX.read(data.originalFile);
      const pick = (word: string) => wb.SheetNames.find((n) => n.toLowerCase().includes(word));
      const out: SheetModel[] = [];
      for (const [word, name] of [["booking", "Bookings"], ["item", "Items"]] as const) {
        const src = pick(word);
        if (!src) continue;
        const rows = XLSX.utils.sheet_to_json<CellValue[]>(wb.Sheets[src], { header: 1, raw: false, defval: "", blankrows: false });
        out.push({ name, rows, headerRows: [], groupRows: [], changed: [], widths: [] });
      }
      if (out.length === 2) return out;
    } catch (e) {
      console.error("could not read original file", e);
    }
  }
  return originalSheets(data.bookings);
}

/** Link an audit to a Google Sheet: copy the original sheets in (only if missing), then sync. */
export async function connectSheet(uploadId: string, input: string) {
  const sheetId = parseSheetId(input);
  if (!sheetId) throw new SheetError("That doesn't look like a Google Sheets link.");
  const data = await loadUploadExport(uploadId);
  if (!data) throw new SheetError("Audit not found.");
  const existing = await tabs(sheetId);
  const originals = originalModels(data).filter((m) => !existing.some((t) => t.title === m.name));
  if (originals.length) await writeSheets(sheetId, originals, false);
  await sql`UPDATE uploads SET google_sheet_id = ${sheetId} WHERE id = ${uploadId}`;
  await syncUpload(uploadId);
}

/** Rewrite the CargoPilot sheets with the latest state. Never touches the original tabs. */
export async function syncUpload(uploadId: string): Promise<void> {
  const data = await loadUploadExport(uploadId);
  if (!data?.googleSheetId) return;
  try {
    await writeSheets(data.googleSheetId, buildExport(data.bookings, data.events));
    await sql`UPDATE uploads SET google_synced_at = now(), google_error = null WHERE id = ${uploadId}`;
  } catch (e) {
    const msg = e instanceof SheetError ? e.message : "Sync failed. Try “Sync now”.";
    console.error("google sync failed", e);
    await sql`UPDATE uploads SET google_error = ${msg} WHERE id = ${uploadId}`;
    throw e;
  }
}
