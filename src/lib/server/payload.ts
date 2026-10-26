import "server-only";
import { buildView } from "../view";
import type { BookingView } from "../types";
import { history, messages, sql, type BookingRow, type CorrectionRow } from "./db";
import { mailerEnabled } from "./mailer";

export interface CarrierEmailRow {
  id: string;
  to_email: string;
  carrier_id: string | null;
  subject: string;
  status: "sent" | "failed";
  error: string | null;
  created_at: string;
}

export interface BookingPayload {
  id: string;
  source: "chat" | "upload";
  uploadId: string | null;
  view: BookingView;
  history: CorrectionRow[];
  messages: { role: "user" | "assistant"; content: string }[];
  original: BookingRow["original"];
  updatedAt: string;
  email: { enabled: boolean; sent: CarrierEmailRow[] };
}

export async function carrierEmails(bookingId: string): Promise<CarrierEmailRow[]> {
  return (await sql`
    SELECT id, to_email, carrier_id, subject, status, error, created_at FROM carrier_emails
    WHERE booking_id = ${bookingId} ORDER BY created_at DESC LIMIT 10`) as CarrierEmailRow[];
}

export async function bookingPayload(row: BookingRow, viewOverride?: BookingView): Promise<BookingPayload> {
  const [h, m, sent] = await Promise.all([
    history(row.id),
    row.source === "chat" ? messages(row.id) : Promise.resolve([]),
    carrierEmails(row.id),
  ]);
  return {
    id: row.id,
    source: row.source,
    uploadId: row.upload_id,
    view: viewOverride ?? buildView(row.booking, row.items),
    history: h,
    messages: m,
    original: row.original,
    updatedAt: row.updated_at,
    email: { enabled: mailerEnabled(), sent },
  };
}
