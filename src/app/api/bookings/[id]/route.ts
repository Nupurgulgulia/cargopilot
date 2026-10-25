import { NextResponse } from "next/server";
import { getBooking } from "@/lib/server/db";
import { bookingPayload } from "@/lib/server/payload";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getBooking(id);
  if (!row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  return NextResponse.json(await bookingPayload(row));
}
