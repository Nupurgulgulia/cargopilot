// Whether the carrier email may go out with the approved invoice attached.
// Pure rules so the API and the form agree, and so they can be tested.
import { EMAIL_LIMIT } from "./compliance/config";

export type InvoiceState = "not_approved" | "approved" | "out_of_date";

export interface AttachmentGate {
  ok: boolean;
  reason?: string;
  /** Where the one-click fix goes. */
  fix?: "invoice" | "attachment";
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Size of the whole message once attachments are Base64-encoded, plus the body. */
export const encodedSize = (pdfBytes: number, bodyBytes = 50_000) => Math.ceil(pdfBytes * EMAIL_LIMIT.base64Factor) + bodyBytes;

export function attachmentGate(opts: { attach: boolean; state: InvoiceState; pdfMatches?: boolean; pdfBytes?: number }): AttachmentGate {
  if (!opts.attach) return { ok: true };
  if (opts.state === "not_approved")
    return { ok: false, fix: "invoice", reason: "The invoice isn't approved yet. Approve it, or turn off \"Attach approved invoice\" to send without it." };
  if (opts.state === "out_of_date")
    return { ok: false, fix: "invoice", reason: "Approval out of date: the invoice data changed after approval. Regenerate and approve it again, or turn off the attachment." };
  if (opts.pdfMatches === false) return { ok: false, fix: "invoice", reason: "Invoice changed after approval." };
  if (opts.pdfBytes != null && encodedSize(opts.pdfBytes) > EMAIL_LIMIT.bytes)
    return {
      ok: false, fix: "attachment",
      reason: `The invoice PDF is ${mb(opts.pdfBytes)} (about ${mb(encodedSize(opts.pdfBytes))} once encoded); the email limit is ${mb(EMAIL_LIMIT.bytes)} including attachments. Send without it and share the print version separately.`,
    };
  return { ok: true };
}

/** Recipients are only addresses typed on this booking: the carrier, plus the buyer when that copy is switched on. */
export function recipientsFor(to: string, buyerCopy: boolean, buyerEmail?: string | null): { email: string; role: "carrier" | "buyer" }[] {
  const out: { email: string; role: "carrier" | "buyer" }[] = [{ email: to.trim(), role: "carrier" }];
  const buyer = buyerEmail?.trim();
  if (buyerCopy && buyer && buyer.toLowerCase() !== to.trim().toLowerCase()) out.push({ email: buyer, role: "buyer" });
  return out;
}

export const formatBytes =(n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : mb(n));
