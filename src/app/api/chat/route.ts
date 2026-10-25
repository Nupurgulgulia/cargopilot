import { NextResponse } from "next/server";
import { z } from "zod";
import { addMessage, createBooking, getBooking, logCorrections, messages, saveBooking, sessionId } from "@/lib/server/db";
import { emptyBooking, runChatTurn } from "@/lib/server/chat";
import { bookingPayload } from "@/lib/server/payload";

export const maxDuration = 60;

const Body = z.object({ bookingId: z.string().uuid().optional(), message: z.string().trim().min(1).max(4000) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please type a message." }, { status: 400 });
  const sid = await sessionId();
  const { message } = parsed.data;

  let id = parsed.data.bookingId;
  let row = id ? await getBooking(id) : null;
  if (id && !row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!row) {
    id = (await createBooking(sid, "chat", emptyBooking(), [])).id;
    row = (await getBooking(id))!;
  }

  const past = await messages(id!);
  await addMessage(id!, "user", message);
  const turn = await runChatTurn(row.booking, row.items, past, message);
  // Any edit after confirmation means the seller has to confirm again.
  if (turn.changes.some((c) => c.path !== "booking.sellerConfirmedAt") && !turn.changes.some((c) => c.path === "booking.sellerConfirmedAt"))
    turn.booking.sellerConfirmedAt = null;
  const view = await saveBooking(id!, turn.booking, turn.items);
  await logCorrections(
    id!,
    turn.changes
      .filter((c) => c.old != null && c.path.includes("."))
      .map((c) => ({ path: c.path, old: c.old, new: c.new, action: "chat_update" as const })),
  );
  await addMessage(id!, "assistant", turn.reply);

  const fresh = (await getBooking(id!))!;
  return NextResponse.json({
    ...(await bookingPayload(fresh, view)),
    reply: turn.reply,
    changes: turn.changes.map((c) => ({ label: c.label, path: c.path })),
  });
}
