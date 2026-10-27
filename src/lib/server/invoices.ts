import "server-only";
import { createHash } from "crypto";
import { COMPLIANCE_VERSION } from "../compliance/config";
import { canonical, invoiceSnapshot } from "../compliance/invoice";
import { runCompliance, type ComplianceView } from "../compliance/rules";
import type { BookingView } from "../types";
import { logCorrections, sql } from "./db";
import { invoiceFileName, invoicePdf } from "./pdf/invoicePdf";

export const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

export interface ApprovalRow {
  id: string;
  invoice_number: string;
  approver_name: string;
  approved_at: string;
  data_hash: string;
  pdf_hash: string;
  pdf_size: number;
  rules_version: string;
}

export interface InvoiceStatus {
  state: "not_approved" | "approved" | "out_of_date";
  approval: ApprovalRow | null;
  fileName: string | null;
}

/** Hash of everything printed on the invoice, so any later change is detected. */
export function invoiceDataHash(view: BookingView, c: ComplianceView = runCompliance(view)): string {
  return sha256(canonical(invoiceSnapshot(c.invoice, view, c.vatLine)));
}

export async function latestApproval(bookingId: string): Promise<ApprovalRow | null> {
  const rows = (await sql`
    SELECT id, invoice_number, approver_name, approved_at, data_hash, pdf_hash, pdf_size, rules_version
    FROM invoice_approvals WHERE booking_id = ${bookingId} ORDER BY approved_at DESC LIMIT 1`) as ApprovalRow[];
  return rows[0] ?? null;
}

export function invoiceStatus(view: BookingView, approval: ApprovalRow | null): InvoiceStatus {
  if (!approval) return { state: "not_approved", approval: null, fileName: null };
  const current = invoiceDataHash(view);
  return {
    state: current === approval.data_hash ? "approved" : "out_of_date",
    approval,
    fileName: invoiceFileName(approval.invoice_number, view.booking.bookingId),
  };
}

/** The exact approved PDF bytes, checked against the hash recorded at approval. */
export async function approvedPdf(approvalId: string): Promise<{ bytes: Uint8Array; matches: boolean } | null> {
  const rows = (await sql`SELECT pdf, pdf_hash FROM invoice_approvals WHERE id = ${approvalId}`) as { pdf: Uint8Array | string; pdf_hash: string }[];
  if (!rows[0]) return null;
  const raw = rows[0].pdf;
  // Neon returns bytea as a "\x…" hex string.
  const bytes = typeof raw === "string" ? Uint8Array.from(Buffer.from(raw.replace(/^\\x/, ""), "hex")) : new Uint8Array(raw);
  return { bytes, matches: sha256(bytes) === rows[0].pdf_hash };
}

export class ApprovalError extends Error {}

/** Generate the final PDF once, hash it and store it with the approver and time. */
export async function approveInvoice(bookingId: string, view: BookingView, approverName: string, now = new Date()): Promise<ApprovalRow> {
  const c = runCompliance(view, now);
  if (c.approveBlockers.length) throw new ApprovalError(c.approveBlockers.join(" "));
  const number = c.invoice.data.invoiceNumber;
  if (!number) throw new ApprovalError("Add an invoice number first.");
  const bytes = await invoicePdf(view, c, { draft: false, at: now });
  const dataHash = invoiceDataHash(view, c);
  const pdfHash = sha256(bytes);
  const rows = (await sql`
    INSERT INTO invoice_approvals (booking_id, invoice_number, approver_name, approved_at, data_hash, pdf_hash, pdf, pdf_size, rules_version)
    VALUES (${bookingId}, ${number}, ${approverName}, ${now.toISOString()}, ${dataHash}, ${pdfHash}, ${"\\x" + Buffer.from(bytes).toString("hex")}::bytea, ${bytes.length}, ${COMPLIANCE_VERSION})
    RETURNING id, invoice_number, approver_name, approved_at, data_hash, pdf_hash, pdf_size, rules_version`) as ApprovalRow[];
  await logCorrections(bookingId, [{ path: "invoice.approval", old: null, new: `Invoice ${number} approved by ${approverName}`, action: "manual_edit" }]);
  return rows[0];
}

/** When an edit makes a current approval stale, say so in the audit trail. */
export async function noteIfApprovalWentStale(bookingId: string, before: BookingView, after: BookingView) {
  const approval = await latestApproval(bookingId);
  if (!approval) return;
  if (invoiceDataHash(before) === approval.data_hash && invoiceDataHash(after) !== approval.data_hash)
    await logCorrections(bookingId, [{ path: "invoice.approval", old: `Invoice ${approval.invoice_number} approved`, new: "Approval out of date: regenerate and approve again", action: "manual_edit" }]);
}
