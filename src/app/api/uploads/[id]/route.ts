import { NextResponse } from "next/server";
import { sessionId } from "@/lib/server/db";
import { loadUpload } from "@/lib/server/uploads";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadUpload(await sessionId(), id);
  if (!data) return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  return NextResponse.json(data);
}
