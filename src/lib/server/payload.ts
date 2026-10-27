import "server-only";
import { buildView } from "../view";
import type { BookingView } from "../types";
import { history, messages, sql, type BookingRow, type CorrectionRow } from "./db";
import { invoiceStatus, latestApproval, type InvoiceStatus } from "./invoices";
import { mailerEnabled } from "./mailer";

export interface CarrierEmailRow {
  id: string;
  to_email: string;
  carrier_id: string | null;
  subject: string;
  status: "sent" | "failed";
  error: string | null;
  created_at: string;
  /** Set when the approved invoice PDF went with this email. */
  attachment: { file_name: string; size_bytes: number; invoice_number: string; approved_at: string; recipient_role: "carrier" | "buyer" } | null;
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
  invoice: InvoiceStatus;
}

export async function carrierEmails(bookingId: string): Promise<CarrierEmailRow[]> {
  return (await sql`
    SELECT e.id, e.to_email, e.carrier_id, e.subject, e.status, e.error, e.created_at,
           CASE WHEN a.email_id IS NULL THEN NULL ELSE json_build_object(
             'file_name', a.file_name, 'size_bytes', a.size_bytes, 'invoice_number', i.invoice_number,
             'approved_at', i.approved_at, 'recipient_role', a.recipient_role) END AS attachment
    FROM carrier_emails e
    LEFT JOIN email_attachments a ON a.email_id = e.id
    LEFT JOIN invoice_approvals i ON i.id = a.approval_id
    WHERE e.booking_id = ${bookingId} ORDER BY e.created_at DESC LIMIT 10`) as CarrierEmailRow[];
}

export async function bookingPayload(row: BookingRow, viewOverride?: BookingView): Promise<BookingPayload> {
  const [h, m, sent, approval] = await Promise.all([
    history(row.id),
    row.source === "chat" ? messages(row.id) : Promise.resolve([]),
    carrierEmails(row.id),
    latestApproval(row.id),
  ]);
  const view = viewOverride ?? buildView(row.booking, row.items);
  return {
    id: row.id,
    source: row.source,
    uploadId: row.upload_id,
    view,
    history: h,
    messages: m,
    original: row.original,
    updatedAt: row.updated_at,
    email: { enabled: mailerEnabled(), sent },
    invoice: invoiceStatus(view, approval),
  };
}
