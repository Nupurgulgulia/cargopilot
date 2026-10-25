import { notFound } from "next/navigation";
import { BookingDeck } from "@/components/BookingDeck";
import { getBooking } from "@/lib/server/db";
import { bookingPayload } from "@/lib/server/payload";

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getBooking(id);
  if (!row) notFound();
  return <BookingDeck initial={await bookingPayload(row)} />;
}
