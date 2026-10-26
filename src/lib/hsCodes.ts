// HS 2022 six-digit nomenclature (UN Comtrade, ODC-PDDL public domain). Server-side only: ~650 KB.
import HS from "../data/hs2022.json";

const CODES = HS as Record<string, string>;

export interface HsCandidate {
  code: string;
  description: string;
}

export function hsDescription(code: string): string | null {
  return CODES[code.replace(/[\s.\-]/g, "")] ?? null;
}

const STOP = new Set(["and", "or", "of", "for", "the", "a", "an", "with", "in", "on", "to", "ml", "kg", "g", "cm", "mm", "x", "pack", "set", "item", "new"]);

/** Lower-case word stems: "mugs" → "mug", "batteries" → "battery", "scarves" → "scarf", "boxes" → "box". */
export function tokens(text: string): string[] {
  const stem = (w: string) => {
    if (w.endsWith("ies")) return `${w.slice(0, -3)}y`;
    if (w.endsWith("ves")) return `${w.slice(0, -3)}f`;
    if (/(x|ch|sh|ss)es$/.test(w)) return w.slice(0, -2);
    if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
    return w;
  };
  return text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);
}

/** Codes whose official text shares the most words with the product description (a shortlist for the AI to choose from). */
export function shortlist(description: string, limit = 40): HsCandidate[] {
  const want = new Set(tokens(description));
  if (want.size === 0) return [];
  const scored: { code: string; score: number }[] = [];
  for (const [code, text] of Object.entries(CODES)) {
    const have = new Set(tokens(text));
    let score = 0;
    for (const w of want) if (have.has(w)) score += 1;
    // "Other" catch-all lines are rarely the best answer; prefer specific wording.
    if (score > 0) scored.push({ code, score: score - (/\bother\b/i.test(text) ? 0.25 : 0) });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
    .slice(0, limit)
    .map(({ code }) => ({ code, description: CODES[code] }));
}
