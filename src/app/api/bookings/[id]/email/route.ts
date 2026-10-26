import { NextResponse } from "next/server";
import { z } from "zod";
import { addressGaps } from "@/lib/addresses";
import { buildCarrierEmail, chosenCarrier } from "@/lib/carrierEmail";
import { buildView } from "@/lib/view";
import { getBooking, sessionId, sql } from "@/lib/server/db";
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
});

/** Preview of the email (GET) so the seller sees exactly what will be sent. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getBooking(id);
  if (!row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const url = new URL(req.url);
  const email = buildCarrierEmail(buildView(row.booking, row.items), {
    replyTo: url.searchParams.get("replyTo") || "you@example.com",
    note: url.searchParams.get("note") ?? undefined,
  });
  return NextResponse.json({ subject: email.subject, text: email.text });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getBooking(id);
  if (!row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!mailerEnabled()) return NextResponse.json({ error: "Email sending isn't set up on this server yet." }, { status: 503 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the email details." }, { status: 400 });

  const view = buildView(row.booking, row.items);
  if (!row.booking.sellerConfirmedAt) return NextResponse.json({ error: "Confirm the booking before emailing the carrier." }, { status: 409 });
  if (view.readiness === "grounded") return NextResponse.json({ error: "Fix the critical issues before emailing the carrier." }, { status: 409 });
  const gaps = addressGaps(row.booking);
  if (gaps.length)
    return NextResponse.json({ error: `Add the collection and delivery details first. Missing: ${gaps.join(", ")}.` }, { status: 409 });

  const sid = await sessionId();
  const [{ booking_count, session_count }] = (await sql`
    SELECT
      count(*) FILTER (WHERE booking_id = ${id} AND created_at > now() - interval '1 hour')::int AS booking_count,
      count(*) FILTER (WHERE session_id = ${sid} AND created_at > now() - interval '1 day')::int AS session_count
    FROM carrier_emails WHERE status = 'sent' AND (booking_id = ${id} OR session_id = ${sid})`) as { booking_count: number; session_count: number }[];
  if (booking_count >= PER_BOOKING_PER_HOUR)
    return NextResponse.json({ error: "This booking has already been emailed several times in the last hour. Please wait before sending again." }, { status: 429 });
  if (session_count >= PER_SESSION_PER_DAY)
    return NextResponse.json({ error: "You've reached today's email limit. Please try again tomorrow." }, { status: 429 });

  const { to, replyTo, note } = parsed.data;
  const email = buildCarrierEmail(view, { replyTo, note });
  const carrierId = chosenCarrier(view)?.carrier.id ?? null;
  try {
    const sent = await sendMail({ to, replyTo, ...email });
    await sql`
      INSERT INTO carrier_emails (booking_id, session_id, carrier_id, to_email, reply_to, subject, note, status)
      VALUES (${id}, ${sid}, ${carrierId}, ${to}, ${replyTo}, ${email.subject}, ${note ?? null}, 'sent')`;
    if (sent.previewUrl) console.log("test email preview:", sent.previewUrl);
  } catch (e) {
    console.error("carrier email failed", e);
    const raw = String((e as Error).message);
    // Resend refuses other recipients until a sending domain is verified.
    const error = /testing emails|own email address|verify a domain/i.test(raw)
      ? "The email service is in test mode, so it can only send to the account owner's address until a sending domain is verified."
      : /domain is not verified|not verified/i.test(raw)
        ? "The sender address's domain isn't verified with the email service yet."
        : "The email couldn't be sent. Check the address and try again.";
    await sql`
      INSERT INTO carrier_emails (booking_id, session_id, carrier_id, to_email, reply_to, subject, note, status, error)
      VALUES (${id}, ${sid}, ${carrierId}, ${to}, ${replyTo}, ${email.subject}, ${note ?? null}, 'failed', ${String((e as Error).message).slice(0, 300)})`;
    return NextResponse.json({ error }, { status: 502 });
  }
  return NextResponse.json(await bookingPayload((await getBooking(id))!, view));
}
