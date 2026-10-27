import { NextResponse } from "next/server";
import { runCompliance } from "@/lib/compliance/rules";
import { buildView } from "@/lib/view";
import { getBooking } from "@/lib/server/db";
import { approvedPdf, invoiceStatus, latestApproval } from "@/lib/server/invoices";
import { invoiceFileName, invoicePdf } from "@/lib/server/pdf/invoicePdf";

export const maxDuration = 30;

/** GET ?copy=approved serves the stored approved PDF (hash-checked); otherwise a DRAFT preview of the current data. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getBooking(id);
  if (!row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const view = buildView(row.booking, row.items);
  const download = new URL(req.url).searchParams.get("download") === "1";
  const headers = (name: string) => ({
    "Content-Type": "application/pdf",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
    "Cache-Control": "private, no-store",
  });

  if (new URL(req.url).searchParams.get("copy") === "approved") {
    const approval = await latestApproval(id);
    if (!approval) return NextResponse.json({ error: "This invoice hasn't been approved yet." }, { status: 404 });
    const pdf = await approvedPdf(approval.id);
    if (!pdf || !pdf.matches) return NextResponse.json({ error: "Invoice changed after approval." }, { status: 409 });
    const status = invoiceStatus(view, approval);
    return new NextResponse(Buffer.from(pdf.bytes), { headers: { ...headers(status.fileName!), "X-Invoice-State": status.state } });
  }

  const c = runCompliance(view);
  const bytes = await invoicePdf(view, c, { draft: true, at: new Date() });
  return new NextResponse(Buffer.from(bytes), { headers: headers(`DRAFT-${invoiceFileName(c.invoice.data.invoiceNumber, row.booking.bookingId)}`) });
}
