import { notFound } from "next/navigation";
import { ChatWorkspace } from "@/components/ChatWorkspace";
import { getBooking } from "@/lib/server/db";
import { bookingPayload } from "@/lib/server/payload";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getBooking(id);
  if (!row) notFound();
  return <ChatWorkspace key={id} initial={await bookingPayload(row)} />;
}
