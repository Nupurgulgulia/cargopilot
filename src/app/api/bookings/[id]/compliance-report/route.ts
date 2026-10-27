import { NextResponse } from "next/server";
import { runCompliance } from "@/lib/compliance/rules";
import { buildView } from "@/lib/view";
import { getBooking } from "@/lib/server/db";
import { invoiceStatus, latestApproval } from "@/lib/server/invoices";
import { reportPdf } from "@/lib/server/pdf/reportPdf";

export const maxDuration = 30;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getBooking(id);
  if (!row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const view = buildView(row.booking, row.items);
  const bytes = await reportPdf(view, runCompliance(view), invoiceStatus(view, await latestApproval(id)), new Date());
  const name = `Compliance-report-${(row.booking.bookingId ?? "booking").replace(/[^\w.-]+/g, "-")}.pdf`;
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
