import { NextResponse } from "next/server";
import { z } from "zod";
import { suggestHs } from "@/lib/server/hsSuggest";

export const maxDuration = 30;

const Body = z.object({ description: z.string().trim().min(3, "Add a product description first.").max(300) });

// Suggested HS codes for a product description; each one is a real HS 2022 code with its official text.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Add a product description first." }, { status: 400 });
  try {
    const suggestions = await suggestHs(parsed.data.description);
    return NextResponse.json({ suggestions });
  } catch (e) {
    console.error("hs suggest failed", e);
    return NextResponse.json({ error: "Couldn't get suggestions right now. Please try again." }, { status: 502 });
  }
}
