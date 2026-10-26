import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export { ThinkingLevel };

const KEYS = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_FALLBACK].filter(Boolean) as string[];
const MODELS = [process.env.GEMINI_MODEL || "gemini-3.8-flash", "gemini-flash-latest"];

interface CallOpts {
  system: string;
  prompt: string;
  json?: object; // JSON shape, described in the prompt; output forced to JSON (strict schema mode was dropping fields)
  temperature?: number;
  thinking?: ThinkingLevel;
  timeoutMs?: number;
}

// Google rejects any request deadline under 10s, so every attempt gets at least that.
const MIN_ATTEMPT_MS = 10_000;
const MAX_ATTEMPT_MS = 13_000;

/** Calls Gemini, falling back to the second key / model on auth, quota or availability errors. */
export async function gemini({ system, prompt, json, temperature = 0, thinking = ThinkingLevel.LOW, timeoutMs = 25_000 }: CallOpts): Promise<string> {
  let lastErr: unknown;
  const start = Date.now();
  for (const model of MODELS) {
    for (const apiKey of KEYS) {
      // Overall budget so fallbacks can't push a request past the platform limit;
      // a fallback only runs if there is still time for a real attempt.
      const left = timeoutMs - (Date.now() - start);
      if (left < MIN_ATTEMPT_MS) break;
      try {
        const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: Math.min(MAX_ATTEMPT_MS, left) } });
        const res = await ai.models.generateContent({
          model,
          contents: json ? `${prompt}

Return JSON matching this shape (every key optional):
${JSON.stringify(json)}` : prompt,
          config: {
            systemInstruction: system,
            temperature,
            thinkingConfig: { thinkingLevel: thinking },
            ...(json ? { responseMimeType: "application/json" } : {}),
          },
        });
        const text = res.text;
        if (text) return text;
        lastErr = new Error("Empty response");
      } catch (e) {
        lastErr = e;
        const msg = String((e as Error)?.message ?? e);
        console.warn(`gemini attempt failed (${model}, key ${KEYS.indexOf(apiKey) + 1}, ${Date.now() - start}ms): ${msg.slice(0, 200)}`);
        // Bad request (e.g. schema) won't be fixed by another key; anything else might be.
        if (/\b400\b/.test(msg) && !/API key/i.test(msg)) break;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
