import { NextResponse } from "next/server";
import { buildLabels, labelBlockers, type LabelFormat, type LabelSelection } from "@/lib/labels";
import { buildView } from "@/lib/view";
import { getBooking } from "@/lib/server/db";
import { labelsPdf } from "@/lib/server/pdf/labelsPdf";

export const maxDuration = 30;
const FORMATS: LabelFormat[] = ["a6", "4x6", "a4"];
const WHICH: LabelSelection[] = ["all", "pallets", "cartons"];
const MAX_LABELS = 500;

/** GET ?format=a6|4x6|a4&which=all|pallets|cartons[&download=1] */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getBooking(id);
  if (!row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const format = (FORMATS.find((f) => f === q.get("format")) ?? "a6") as LabelFormat;
  const which = (WHICH.find((w) => w === q.get("which")) ?? "all") as LabelSelection;
  const view = buildView(row.booking, row.items);
  const blockers = labelBlockers(view);
  if (blockers.length) return NextResponse.json({ error: blockers.map((b) => b.message).join(" ") }, { status: 409 });
  const labels = buildLabels(view, which);
  if (!labels.length) return NextResponse.json({ error: "No labels to print for that selection." }, { status: 400 });
  if (labels.length > MAX_LABELS) return NextResponse.json({ error: `That's ${labels.length} labels; print pallets and cartons separately (up to ${MAX_LABELS} at a time).` }, { status: 413 });
  const bytes = await labelsPdf(labels, format, new Date());
  const name = `Labels-${(row.booking.bookingId ?? "booking").replace(/[^\w.-]+/g, "-")}-${which}-${format}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${q.get("download") === "1" ? "attachment" : "inline"}; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
