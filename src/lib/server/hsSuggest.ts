import "server-only";
import { z } from "zod";
import { hsDescription, shortlist } from "../hsCodes";
import { sql } from "./db";
import { gemini } from "./gemini";

export interface HsSuggestion {
  code: string;
  description: string;
  reason: string;
}

const Reply = z.object({
  candidates: z
    .array(z.object({ code: z.preprocess((v) => String(v ?? ""), z.string()), reason: z.string().optional().catch(undefined) }))
    .catch([]),
});

const SYSTEM = `You are a customs classification assistant. Given a product description, pick the most likely HS 2022 six-digit subheadings.
Rules:
- Prefer codes from the SHORTLIST (official HS 2022 text). You may use another real HS 2022 six-digit code only if none fit.
- Return up to 3 candidates, best first, as 6 digits with no dots.
- "reason" is one short plain sentence saying why it fits (material, use or type). No em dashes.
- If the description is too vague to classify, return an empty list.
Return JSON: {"candidates":[{"code":"420222","reason":"..."}]}`;

const keyFor = (description: string) => description.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 300);

/**
 * Up to 3 HS codes for a product description. Every code is checked against the official
 * HS 2022 list, so an invented code can never be suggested. Results are cached per description.
 */
export async function suggestHs(description: string): Promise<HsSuggestion[]> {
  const key = keyFor(description);
  if (key.length < 3) return [];
  const cached = (await sql`SELECT result FROM hs_suggestions WHERE key = ${key}`) as { result: HsSuggestion[] }[];
  if (cached[0]) return cached[0].result;

  const list = shortlist(description);
  const prompt = `PRODUCT: ${description}\n\nSHORTLIST:\n${list.map((c) => `${c.code}: ${c.description}`).join("\n") || "(no keyword matches)"}`;
  const raw = await gemini({ system: SYSTEM, prompt, json: { candidates: [{ code: "string", reason: "string" }] }, timeoutMs: 15_000 });
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const seen = new Set<string>();
  const result: HsSuggestion[] = [];
  for (const c of Reply.parse(parsed ?? {}).candidates) {
    const code = c.code.replace(/\D/g, "").slice(0, 6);
    const official = hsDescription(code);
    if (!official || seen.has(code)) continue; // not a real HS 2022 code: drop it
    seen.add(code);
    result.push({ code, description: official, reason: c.reason?.trim() || "Matches the product description." });
    if (result.length === 3) break;
  }
  if (result.length) {
    await sql`INSERT INTO hs_suggestions (key, result) VALUES (${key}, ${JSON.stringify(result)}) ON CONFLICT (key) DO NOTHING`;
  }
  return result;
}
