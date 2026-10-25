import { NextResponse } from "next/server";
import { z } from "zod";
import { importWorkbook, type SheetRows } from "@/lib/workbook";
import { createBooking, sessionId, sql } from "@/lib/server/db";

export const maxDuration = 60;

// The browser parses the .xlsx (SheetJS) and sends raw rows; all checking happens here.
const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const Body = z.object({
  fileName: z.string().max(255),
  sheets: z.record(z.string(), z.array(z.array(Cell.optional()).max(200)).max(5000)),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That file couldn't be read as a workbook." }, { status: 400 });
  const sid = await sessionId();
  const res = importWorkbook(parsed.data.sheets as Record<string, SheetRows>);
  if (!res.ok) return NextResponse.json({ error: res.fileIssues.map((i) => i.message).join(" "), fileIssues: res.fileIssues }, { status: 422 });

  const issues = [...res.fileIssues, ...res.notes.map((message) => ({ level: "info", message }))];
  const up = await sql`
    INSERT INTO uploads (session_id, file_name, booking_count, import_issues)
    VALUES (${sid}, ${parsed.data.fileName}, ${res.bookings.length}, ${JSON.stringify(issues)})
    RETURNING id`;
  const uploadId = up[0].id as string;
  for (const b of res.bookings) await createBooking(sid, "upload", b.booking, b.items, uploadId);
  return NextResponse.json({ uploadId });
}
