import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/server/db";
import { connectSheet, SheetError, syncUpload } from "@/lib/server/googleSync";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

async function exists(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  return (await sql`SELECT 1 FROM uploads WHERE id = ${id}`).length > 0;
}

function fail(e: unknown) {
  if (e instanceof SheetError) return NextResponse.json({ error: e.message }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: "Couldn't reach Google Sheets. Please try again." }, { status: 502 });
}

// Connect an audit to a Google Sheet.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await exists(id))) return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  const body = z.object({ sheetUrl: z.string().min(10).max(500) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Paste the Google Sheet's link." }, { status: 400 });
  try {
    await connectSheet(id, body.data.sheetUrl);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

// Sync now.
export async function PUT(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await exists(id))) return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  try {
    await syncUpload(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

// Disconnect (the Google Sheet itself is left as it is).
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await sql`UPDATE uploads SET google_sheet_id = null, google_synced_at = null, google_error = null WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
