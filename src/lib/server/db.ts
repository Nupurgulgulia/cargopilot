import "server-only";
import { neon } from "@neondatabase/serverless";
import { cookies } from "next/headers";
import { buildView } from "../view";
import type { Booking, BookingView, Item } from "../types";

export const sql = neon(process.env.DATABASE_URL!);

export const SESSION_COOKIE = "cp_sid";

/** Anonymous session: no login, just a cookie set by middleware. */
export async function sessionId(): Promise<string> {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sid) throw new Error("No session cookie");
  await sql`INSERT INTO sessions (id) VALUES (${sid})
            ON CONFLICT (id) DO UPDATE SET last_seen_at = now()`;
  return sid;
}

export interface BookingRow {
  id: string;
  session_id: string;
  upload_id: string | null;
  source: "chat" | "upload";
  booking_ref: string | null;
  booking: Booking;
  items: Item[];
  original: { booking: Booking; items: Item[] } | null;
  readiness: string | null;
  red_count: number;
  amber_count: number;
  created_at: string;
  updated_at: string;
}

export async function createBooking(
  sid: string,
  source: "chat" | "upload",
  booking: Booking,
  items: Item[],
  uploadId: string | null = null,
): Promise<{ id: string; view: BookingView }> {
  const view = buildView(booking, items);
  const original = source === "upload" ? { booking, items } : null;
  const rows = await sql`
    INSERT INTO bookings (session_id, upload_id, source, booking_ref, booking, items, original, readiness, red_count, amber_count)
    VALUES (${sid}, ${uploadId}, ${source}, ${booking.bookingId}, ${JSON.stringify(booking)}, ${JSON.stringify(items)},
            ${original ? JSON.stringify(original) : null}, ${view.readiness}, ${view.summary.red}, ${view.summary.amber})
    RETURNING id`;
  return { id: rows[0].id as string, view };
}

/** Bookings are opened by their unguessable id, so result links can be shared (no login). */
export async function getBooking(id: string): Promise<BookingRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await sql`SELECT * FROM bookings WHERE id = ${id}`;
  return (rows[0] as BookingRow) ?? null;
}

export async function saveBooking(id: string, booking: Booking, items: Item[]): Promise<BookingView> {
  const view = buildView(booking, items);
  await sql`
    UPDATE bookings SET booking = ${JSON.stringify(booking)}, items = ${JSON.stringify(items)},
      booking_ref = ${booking.bookingId}, readiness = ${view.readiness},
      red_count = ${view.summary.red}, amber_count = ${view.summary.amber}, updated_at = now()
    WHERE id = ${id}`;
  return view;
}

export interface CorrectionRow {
  id: string;
  field_path: string;
  old_value: unknown;
  new_value: unknown;
  action: "accepted_fix" | "kept_original" | "chat_update" | "manual_edit";
  rule_id: string | null;
  reason: string | null;
  created_at: string;
}

export async function logCorrections(
  bookingId: string,
  events: { path: string; old: unknown; new: unknown; action: CorrectionRow["action"]; ruleId?: string | null; reason?: string | null }[],
) {
  for (const e of events) {
    await sql`
      INSERT INTO correction_events (booking_id, field_path, old_value, new_value, action, rule_id, reason)
      VALUES (${bookingId}, ${e.path}, ${JSON.stringify(e.old ?? null)}, ${JSON.stringify(e.new ?? null)}, ${e.action}, ${e.ruleId ?? null}, ${e.reason ?? null})`;
  }
}

export async function history(bookingId: string): Promise<CorrectionRow[]> {
  return (await sql`SELECT * FROM correction_events WHERE booking_id = ${bookingId} ORDER BY created_at, id`) as CorrectionRow[];
}

export async function messages(bookingId: string): Promise<{ role: "user" | "assistant"; content: string }[]> {
  return (await sql`SELECT role, content FROM chat_messages WHERE booking_id = ${bookingId} ORDER BY id`) as {
    role: "user" | "assistant";
    content: string;
  }[];
}

export async function addMessage(bookingId: string, role: "user" | "assistant", content: string) {
  await sql`INSERT INTO chat_messages (booking_id, role, content) VALUES (${bookingId}, ${role}, ${content})`;
}
