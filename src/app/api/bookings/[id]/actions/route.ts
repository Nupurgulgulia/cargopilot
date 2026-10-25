import { NextResponse } from "next/server";
import { z } from "zod";
import { applyChange, ChangeError, clearKeptFor } from "@/lib/changes";
import { buildView } from "@/lib/view";
import { getBooking, logCorrections, saveBooking, sessionId } from "@/lib/server/db";
import { bookingPayload } from "@/lib/server/payload";

// Error Detective actions: accept a suggested fix, enter a value, keep the original with a reason, confirm.
const Body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("apply"), path: z.string(), value: z.unknown(), ruleId: z.string().optional(), suggested: z.boolean().optional() }),
  z.object({ type: z.literal("keep"), key: z.string(), ruleId: z.string(), reason: z.string().trim().min(3).max(500) }),
  z.object({ type: z.literal("unkeep"), key: z.string(), ruleId: z.string() }),
  z.object({ type: z.literal("confirm") }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sid = await sessionId();
  const row = await getBooking(sid, id);
  if (!row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  const a = parsed.data;

  let booking = row.booking;
  let items = row.items;
  try {
    if (a.type === "apply") {
      const r = applyChange(booking, items, a.path, a.value);
      booking = clearKeptFor(r.booking, a.path);
      items = r.items;
      await logCorrections(id, [{
        path: a.path, old: r.oldValue, new: r.newValue,
        action: a.suggested ? "accepted_fix" : "manual_edit", ruleId: a.ruleId,
      }]);
    } else if (a.type === "keep") {
      booking = { ...booking, keptOriginal: { ...(booking.keptOriginal ?? {}), [a.key]: a.reason } };
      await logCorrections(id, [{ path: a.key, old: null, new: null, action: "kept_original", ruleId: a.ruleId, reason: a.reason }]);
    } else if (a.type === "unkeep") {
      const kept = { ...(booking.keptOriginal ?? {}) };
      delete kept[a.key];
      booking = { ...booking, keptOriginal: kept };
    } else if (a.type === "confirm") {
      const v = buildView(booking, items);
      if (v.readiness === "grounded") return NextResponse.json({ error: "Fix the critical (Red) issues before confirming." }, { status: 409 });
      if (v.missing.length) return NextResponse.json({ error: "Some details are still missing." }, { status: 409 });
      booking = { ...booking, sellerConfirmedAt: new Date().toISOString() };
    }
  } catch (e) {
    if (e instanceof ChangeError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  // Any edit after confirmation means the seller has to confirm again.
  if (a.type !== "confirm" && booking.sellerConfirmedAt) booking = { ...booking, sellerConfirmedAt: null };
  const view = await saveBooking(id, booking, items);
  return NextResponse.json(await bookingPayload((await getBooking(sid, id))!, view));
}
