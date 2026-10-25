import "server-only";
import type { ExportBooking, ExportEvent } from "../exportModel";
import { sql, type BookingRow, type CorrectionRow } from "./db";

export interface UploadExport {
  id: string;
  fileName: string;
  originalFile: Buffer | null;
  googleSheetId: string | null;
  bookings: ExportBooking[];
  events: ExportEvent[];
}

/** Everything needed to build the updated workbook for one audit. */
export async function loadUploadExport(uploadId: string): Promise<UploadExport | null> {
  if (!/^[0-9a-f-]{36}$/i.test(uploadId)) return null;
  const up = await sql`SELECT id, file_name, original_file_b64, google_sheet_id FROM uploads WHERE id = ${uploadId}`;
  if (!up[0]) return null;
  const rows = (await sql`
    SELECT id, booking, items, original FROM bookings WHERE upload_id = ${uploadId}
    ORDER BY (booking->>'sourceRow')::int NULLS LAST, created_at`) as BookingRow[];
  const ids = rows.map((r) => r.id);
  const events = ids.length
    ? ((await sql`SELECT * FROM correction_events WHERE booking_id = ANY(${ids}) ORDER BY created_at, id`) as (CorrectionRow & { booking_id: string })[])
    : [];
  return {
    id: uploadId,
    fileName: up[0].file_name as string,
    originalFile: up[0].original_file_b64 ? Buffer.from(up[0].original_file_b64 as string, "base64") : null,
    googleSheetId: (up[0].google_sheet_id as string | null) ?? null,
    bookings: rows.map((r) => ({ booking: r.booking, items: r.items, original: r.original })),
    events: events.map((e) => ({
      bookingIndex: ids.indexOf(e.booking_id),
      path: e.field_path,
      oldValue: e.old_value,
      newValue: e.new_value,
      action: e.action,
      ruleId: e.rule_id,
      at: new Date(e.created_at).toISOString(),
    })),
  };
}
