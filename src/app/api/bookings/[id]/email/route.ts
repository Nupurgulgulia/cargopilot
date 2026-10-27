import { NextResponse } from "next/server";
import { z } from "zod";
import { addressGaps } from "@/lib/addresses";
import { buildCarrierEmail, chosenCarrier } from "@/lib/carrierEmail";
import { attachmentGate, recipientsFor } from "@/lib/invoiceEmail";
import { buildView } from "@/lib/view";
import { getBooking, sessionId, sql } from "@/lib/server/db";
import { approvedPdf, invoiceStatus, latestApproval } from "@/lib/server/invoices";
import { mailerEnabled, sendMail } from "@/lib/server/mailer";
import { bookingPayload } from "@/lib/server/payload";

export const maxDuration = 30;

// Limits so an open, no-login app can't be used to spam people.
const PER_BOOKING_PER_HOUR = 3;
const PER_SESSION_PER_DAY = 15;

const Body = z.object({
  to: z.string().trim().email("Enter a valid carrier email address.").max(200),
  replyTo: z.string().trim().email("Enter a valid email address for replies.").max(200),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
  attachInvoice: z.boolean().optional(),
  buyerCopy: z.boolean().optional(),
  buyerEmail: z.string().trim().max(200).optional(),
});

/** Work out the attachment for this send: the exact approved PDF, or a reason it can't go. */
async function attachmentFor(bookingId: string, view: ReturnType<typeof buildView>, attach: boolean) {
  if (!attach) return { gate: attachmentGate({ attach: false, state: "not_approved" }), approval: null, pdf: null, fileName: null };
  const approval = await latestApproval(bookingId);
  const status = invoiceStatus(view, approval);
  const pdf = status.state === "approved" && approval ? await approvedPdf(approval.id) : null;
  const gate = attachmentGate({ attach: true, state: status.state, pdfMatches: pdf ? pdf.matches : undefined, pdfBytes: pdf?.bytes.length });
  return { gate, approval, pdf, fileName: status.fileName };
}

/** Preview of the email (GET) so the seller sees exactly what will be sent, including the attachment. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getBooking(id);
  if (!row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const url = new URL(req.url);
  const view = buildView(row.booking, row.items);
  const attach = url.searchParams.get("attach") === "1";
  const a = await attachmentFor(id, view, attach);
  const email = buildCarrierEmail(view, {
    replyTo: url.searchParams.get("replyTo") || "you@example.com",
    note: url.searchParams.get("note") ?? undefined,
    attachedInvoice: attach && a.gate.ok ? a.approval?.invoice_number : null,
  });
  return NextResponse.json({
    subject: email.subject,
    text: email.text,
    attachment: attach && a.gate.ok && a.approval ? { fileName: a.fileName, sizeBytes: a.approval.pdf_size, invoiceNumber: a.approval.invoice_number, approvedAt: a.approval.approved_at } : null,
    blocked: a.gate.ok ? null : { reason: a.gate.reason, fix: a.gate.fix },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getBooking(id);
  if (!row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!mailerEnabled()) return NextResponse.json({ error: "Email sending isn't set up on this server yet." }, { status: 503 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the email details." }, { status: 400 });
  const { to, replyTo, note, attachInvoice = false, buyerCopy = false } = parsed.data;
  if (buyerCopy && !parsed.data.buyerEmail?.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return NextResponse.json({ error: "Enter a valid buyer email address, or turn off the buyer copy." }, { status: 400 });
  // Only addresses typed on this booking; never added automatically.
  const buyerEmail = recipientsFor(to, buyerCopy, parsed.data.buyerEmail).find((r) => r.role === "buyer")?.email;

  const view = buildView(row.booking, row.items);
  if (!row.booking.sellerConfirmedAt) return NextResponse.json({ error: "Confirm the booking before emailing the carrier." }, { status: 409 });
  if (view.readiness === "grounded") return NextResponse.json({ error: "Fix the critical issues before emailing the carrier." }, { status: 409 });
  const gaps = addressGaps(row.booking);
  if (gaps.length)
    return NextResponse.json({ error: `Add the collection and delivery details first. Missing: ${gaps.join(", ")}.` }, { status: 409 });

  // The attached PDF is the exact approved file, never regenerated here.
  const a = await attachmentFor(id, view, attachInvoice);
  if (!a.gate.ok) return NextResponse.json({ error: a.gate.reason, fix: a.gate.fix }, { status: 409 });

  const sid = await sessionId();
  const recipients = 1 + (buyerEmail ? 1 : 0);
  const [{ booking_count, session_count }] = (await sql`
    SELECT
      count(*) FILTER (WHERE booking_id = ${id} AND created_at > now() - interval '1 hour')::int AS booking_count,
      count(*) FILTER (WHERE session_id = ${sid} AND created_at > now() - interval '1 day')::int AS session_count
    FROM carrier_emails WHERE status = 'sent' AND (booking_id = ${id} OR session_id = ${sid})`) as { booking_count: number; session_count: number }[];
  // A send with a buyer copy writes two rows, so scale the per-booking limit by the recipients on this send.
  if (booking_count >= PER_BOOKING_PER_HOUR * recipients)
    return NextResponse.json({ error: "This booking has already been emailed several times in the last hour. Please wait before sending again." }, { status: 429 });
  if (session_count + recipients > PER_SESSION_PER_DAY)
    return NextResponse.json({ error: "You've reached today's email limit. Please try again tomorrow." }, { status: 429 });

  const email = buildCarrierEmail(view, { replyTo, note, attachedInvoice: a.approval?.invoice_number ?? null });
  const attachments = a.pdf && a.fileName ? [{ filename: a.fileName, content: Buffer.from(a.pdf.bytes), contentType: "application/pdf" }] : undefined;
  const carrierId = chosenCarrier(view)?.carrier.id ?? null;

  const send = async (recipient: string, role: "carrier" | "buyer") => {
    try {
      await sendMail({ to: recipient, replyTo, ...email, attachments });
      const [{ id: emailId }] = (await sql`
        INSERT INTO carrier_emails (booking_id, session_id, carrier_id, to_email, reply_to, subject, note, status)
        VALUES (${id}, ${sid}, ${carrierId}, ${recipient}, ${replyTo}, ${email.subject}, ${note ?? null}, 'sent') RETURNING id`) as { id: string }[];
      if (a.approval && attachments)
        await sql`INSERT INTO email_attachments (email_id, approval_id, file_name, size_bytes, recipient_role)
                  VALUES (${emailId}, ${a.approval.id}, ${a.fileName}, ${a.approval.pdf_size}, ${role})`;
      return null;
    } catch (e) {
      console.error("carrier email failed", (e as Error).message); // never log the PDF or the email body
      const raw = String((e as Error).message);
      await sql`
        INSERT INTO carrier_emails (booking_id, session_id, carrier_id, to_email, reply_to, subject, note, status, error)
        VALUES (${id}, ${sid}, ${carrierId}, ${recipient}, ${replyTo}, ${email.subject}, ${note ?? null}, 'failed', ${raw.slice(0, 300)})`;
      // Resend refuses other recipients until a sending domain is verified.
      return /testing emails|own email address|verify a domain/i.test(raw)
        ? "The email service is in test mode, so it can only send to the account owner's address until a sending domain is verified."
        : /domain is not verified|not verified/i.test(raw)
          ? "The sender address's domain isn't verified with the email service yet."
          : "The email couldn't be sent. Check the address and try again.";
    }
  };

  const carrierError = await send(to, "carrier");
  if (carrierError) return NextResponse.json({ error: carrierError }, { status: 502 });
  const buyerError = buyerEmail ? await send(buyerEmail, "buyer") : null;
  const payload = await bookingPayload((await getBooking(id))!, view);
  return NextResponse.json(buyerError ? { ...payload, warning: `Sent to the carrier, but the buyer copy failed: ${buyerError}` } : payload);
}
