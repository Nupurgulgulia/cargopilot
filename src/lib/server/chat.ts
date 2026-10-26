import "server-only";
import { z } from "zod";
import {
  BOOKING_FIELD_LABELS, CARRIERS, DESTINATIONS, ITEM_FIELD_LABELS, ITEM_ORIGIN_COUNTRIES, ORIGIN_CITIES, SELLER_PRIORITIES,
} from "../constants";
import { applyChange, ChangeError, clearKeptFor } from "../changes";
import { carrierLabel } from "../carriers";
import { gbp0, isoToDisplay, num, todayISO } from "../format";
import type { Booking, BookingView, Item, MissingField } from "../types";
import { buildView } from "../view";
import { gemini } from "./gemini";

// ---------------- Extraction ----------------

const num_ = { type: "number" };
const str_ = { type: "string" };
export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    booking: {
      type: "object",
      properties: {
        sellerName: str_, originCity: str_, destinationCity: str_, destinationCountry: str_,
        destinationType: { type: "string", enum: ["Warehouse", "Business address"] },
        readyToShipDate: { type: "string", description: "DD-MM-YYYY" },
        sellerPriority: { type: "string", enum: SELLER_PRIORITIES },
        pallets: num_, cartons: num_, declaredValue: num_, grossWeightKg: num_,
        deliveryAppointmentBooked: { type: "boolean" },
      },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: { type: "integer", description: "1-based number of an EXISTING item being updated. Omit for a new item." },
          sku: str_, description: str_, hsCode: str_, quantity: num_, unitPrice: num_, unitsPerCarton: num_, cartons: num_,
          unitWeightKg: num_, countryOfOrigin: str_,
        },
      },
    },
    removeItems: { type: "array", items: { type: "integer" } },
    unknownFields: { type: "array", items: str_ },
    hazardAnswers: {
      type: "array",
      items: { type: "object", properties: { ref: { type: "integer" }, answer: { type: "string", enum: ["none", "contains"] } }, required: ["ref", "answer"] },
    },
    chooseCarrier: { type: "string", enum: ["Carrier A", "Carrier B", "Carrier C"] },
    confirmBooking: { type: "boolean" },
    clarify: { type: "array", items: str_ },
  },
};

// Lenient on form, strict on meaning: nulls mean "not stated", "£6,000" is 6000, 691200 is "691200".
// Values that still don't fit are dropped individually instead of failing the whole reply.
const n = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.replace(/[£,\s]|kg/gi, "")) : v),
  z.number().finite(),
).optional().catch(undefined);
const s = z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string()).optional().catch(undefined);
const bool = z.preprocess(
  (v) => (typeof v === "string" ? ({ yes: true, true: true, no: false, false: false } as Record<string, boolean>)[v.toLowerCase()] : v),
  z.boolean(),
).optional().catch(undefined);
const int = z.preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int()).optional().catch(undefined);

function dropNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropNulls);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, dropNulls(x)]));
  return v;
}

export const Extraction = z.preprocess(dropNulls, z.object({
  booking: z.object({
    sellerName: s, originCity: s, destinationCity: s, destinationCountry: s,
    destinationType: s, readyToShipDate: s, sellerPriority: s,
    pallets: n, cartons: n, declaredValue: n, grossWeightKg: n, deliveryAppointmentBooked: bool,
  }).optional(),
  items: z.array(z.object({
    ref: int,
    sku: s, description: s, hsCode: s, quantity: n, unitPrice: n, unitsPerCarton: n, cartons: n,
    unitWeightKg: n, countryOfOrigin: s,
  })).optional(),
  removeItems: z.array(z.number().int()).optional().catch(undefined),
  unknownFields: z.array(z.string()).optional().catch(undefined),
  hazardAnswers: z.array(z.object({ ref: z.number().int(), answer: z.enum(["none", "contains"]) })).optional().catch(undefined),
  chooseCarrier: s,
  confirmBooking: bool,
  clarify: z.array(z.string()).optional().catch(undefined),
}));
type Extraction = z.infer<typeof Extraction>;

export const EXTRACT_SYSTEM = `You are the data-extraction step of CargoPilot, a shipment-booking assistant for road freight from the United Kingdom to Germany, France or the Netherlands.
You receive the current booking state, recent conversation and the seller's LATEST message. Return JSON with ONLY the values the seller explicitly states or changes in the latest message.

Rules:
- Capture EVERY value the seller states. A single message often contains the whole booking AND all its products; include every one of them. Never guess or invent values that are not stated (HS codes, weights, prices, dates, countries of origin, yes/no answers): omit those.
- Use earlier messages only to understand what the seller is answering (e.g. "yes" or "3" answering the assistant's last question).
- Relative edits are allowed: "add a pallet" with 2 pallets on file → pallets 3; "make it 1,200 units" → quantity 1200.
- Allowed origin cities: ${ORIGIN_CITIES.join(", ")}. Destinations: ${Object.entries(DESTINATIONS).map(([c, cs]) => `${c} (${cs.join(", ")})`).join("; ")}. If the seller names any other city or country, do NOT put it in booking; add a short note to "clarify".
- destinationType: "Warehouse" for warehouses, fulfilment/distribution centres, Amazon FCs; "Business address" for shops, offices, stores, customer premises.
- sellerPriority: Cheapest (cheap, lowest cost, budget), Fastest (urgent, ASAP, quick), Most reliable (must arrive on time, reliability), Balanced (no preference, best trade-off).
- Money is GBP. "£5 each" → unitPrice 5. declaredValue = the total goods value the seller states (e.g. "declared value £6,000", "goods worth £6k" → 6000). Copy what they say; never calculate it from items yourself.
- grossWeightKg is the TOTAL shipment weight incl. packaging/pallets. Per-unit weights go to item.unitWeightKg.
- cartons: item.cartons is cartons of that product. booking.cartons is the shipment's total. If the shipment has (or will have) exactly one product and the seller states a carton count, set both.
- Items: a product line. For a NEW product, omit "ref". To change an existing product, set "ref" to its number in the state list. countryOfOrigin must be one of: ${ITEM_ORIGIN_COUNTRIES.join(", ")} (where it was made, not where it ships from).
- readyToShipDate as DD-MM-YYYY; resolve relative dates ("next Monday", "tomorrow") using today's date given in the state.
- If the seller says they don't know / don't have a value, list its path in unknownFields, e.g. "booking.grossWeightKg" or "items.1.hsCode" (1-based item number).
- hazardAnswers: when the seller confirms whether a flagged item contains a lithium battery, aerosol or flammable liquid.
- chooseCarrier: only if the seller explicitly picks a carrier. confirmBooking: only if the seller explicitly confirms/approves the final booking.
- deliveryAppointmentBooked only if the seller says whether a delivery slot/appointment is booked.
- Before answering, re-read the message and check that every stated number and code appears in your JSON.
- Output nothing else but the JSON object.`;

export function stateForPrompt(b: Booking, items: Item[]) {
  return {
    today: isoToDisplay(todayISO()),
    booking: {
      sellerName: b.sellerName, originCity: b.originCity, destinationCity: b.destinationCity, destinationCountry: b.destinationCountry,
      destinationType: b.destinationType, readyToShipDate: b.readyToShipDate ? isoToDisplay(b.readyToShipDate) : null,
      sellerPriority: b.sellerPriority, pallets: b.pallets, cartons: b.cartons, declaredValueGBP: b.declaredValue,
      grossWeightKg: b.grossWeightKg, deliveryAppointmentBooked: b.deliveryAppointmentBooked,
    },
    items: items.map((it, i) => ({ number: i + 1, ...it, sourceRow: undefined })),
  };
}

// ---------------- Apply ----------------

interface Applied {
  booking: Booking;
  items: Item[];
  changes: { path: string; label: string; old: unknown; new: unknown }[];
  rejected: string[];
  unknown: string[];
}

const label = (path: string, items: Item[]) => {
  const p = path.split(".");
  if (p[0] === "booking") return BOOKING_FIELD_LABELS[p[1]]?.replace(/ \(.*\)$/, "") ?? p[1];
  if (p[0] === "items") {
    const it = items[Number(p[1])];
    const name = it?.sku || it?.description || `Item ${Number(p[1]) + 1}`;
    return `${name} ${(ITEM_FIELD_LABELS[p[2]] ?? p[2]).toLowerCase()}`;
  }
  if (p[0] === "hazard") return `Restricted-goods answer for item ${Number(p[1]) + 1}`;
  return path;
};

function fmt(v: unknown): string {
  if (v == null) return "blank";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return num(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return isoToDisplay(v);
  return String(v);
}

export function applyExtraction(booking: Booking, items: Item[], ex: Extraction): Applied {
  let b = booking;
  let its = items;
  const changes: Applied["changes"] = [];
  const rejected: string[] = [];
  const unknown: string[] = [];

  const set = (path: string, value: unknown) => {
    try {
      const r = applyChange(b, its, path, value);
      const same = JSON.stringify(r.oldValue) === JSON.stringify(r.newValue);
      b = r.booking;
      its = r.items;
      if (!same) {
        b = clearKeptFor(b, path);
        b.skippedFields = (b.skippedFields ?? []).filter((s) => s !== path);
        changes.push({ path, label: label(path, its), old: r.oldValue, new: r.newValue });
      }
    } catch (e) {
      if (e instanceof ChangeError) rejected.push(`${label(path, its)}: ${e.message}`);
      else throw e;
    }
  };

  const bk = ex.booking ?? {};
  // City before country so the country is derived from the city and any conflict is caught.
  const order = ["sellerName", "originCity", "destinationCity", "destinationType", "readyToShipDate", "sellerPriority", "pallets", "cartons", "declaredValue", "grossWeightKg", "deliveryAppointmentBooked"] as const;
  for (const f of order) if (bk[f] !== undefined && bk[f] !== null) set(`booking.${f}`, bk[f]);
  if (bk.destinationCountry && !bk.destinationCity) {
    if (b.destinationCity && b.destinationCountry && b.destinationCountry.toLowerCase() !== bk.destinationCountry.toLowerCase()) {
      rejected.push(`Destination country: ${bk.destinationCountry} doesn't match ${b.destinationCity}. Please give a city in ${bk.destinationCountry}.`);
    } else set("booking.destinationCountry", bk.destinationCountry);
  } else if (bk.destinationCountry && b.destinationCountry && b.destinationCountry.toLowerCase() !== bk.destinationCountry.toLowerCase()) {
    rejected.push(`${b.destinationCity} is in ${b.destinationCountry}, not ${bk.destinationCountry}.`);
  }

  for (const it of ex.items ?? []) {
    let idx: number;
    if (it.ref && it.ref >= 1 && it.ref <= its.length) idx = it.ref - 1;
    else {
      // Treat a "new" item that repeats an existing SKU/description as an update.
      const dup = its.findIndex((x) => (it.sku && x.sku === it.sku) || (it.description && x.description?.toLowerCase() === it.description.toLowerCase()));
      if (dup >= 0) idx = dup;
      else {
        const r = applyChange(b, its, "items.new", null);
        b = r.booking;
        its = r.items;
        idx = its.length - 1;
        changes.push({ path: `items.${idx}`, label: "New product added", old: null, new: it.description ?? it.sku ?? "item" });
      }
    }
    const fields = ["sku", "description", "hsCode", "quantity", "unitPrice", "unitsPerCarton", "cartons", "unitWeightKg", "countryOfOrigin"] as const;
    for (const f of fields) if (it[f] !== undefined && it[f] !== null && it[f] !== "") set(`items.${idx}.${f}`, it[f]);
    if (!its[idx].sku) its = its.map((x, j) => (j === idx ? { ...x, sku: `ITEM-${idx + 1}` } : x));
  }

  for (const h of ex.hazardAnswers ?? []) if (its[h.ref - 1]) set(`hazard.${h.ref - 1}`, h.answer);

  for (const ref of [...(ex.removeItems ?? [])].sort((a, c) => c - a)) {
    if (its[ref - 1]) set(`items.${ref - 1}`, null);
  }

  if (ex.chooseCarrier && b.destinationCountry) {
    const c = CARRIERS.find((x) => x.carrier === ex.chooseCarrier && x.destinationCountry === b.destinationCountry);
    if (c) set("booking.chosenCarrier", c.id);
  }

  for (const raw of ex.unknownFields ?? []) {
    const m = raw.match(/^items\.(\d+)\.(\w+)$/);
    const path = m ? `items.${Number(m[1]) - 1}.${m[2]}` : raw.startsWith("booking.") ? raw : `booking.${raw}`;
    if (!(b.skippedFields ?? []).includes(path)) {
      b = { ...b, skippedFields: [...(b.skippedFields ?? []), path] };
      unknown.push(label(path, its));
    }
  }

  if (ex.confirmBooking) {
    const v = buildView(b, its);
    if (v.readiness !== "grounded" && v.missing.length === 0) {
      b = { ...b, sellerConfirmedAt: new Date().toISOString() };
      changes.push({ path: "booking.sellerConfirmedAt", label: "Booking confirmed by seller", old: null, new: "confirmed" });
    } else {
      rejected.push(v.readiness === "grounded" ? "Can't confirm yet. Fix the critical (Red) issues first." : "Can't confirm yet. Some details are still missing.");
    }
  }
  return { booking: b, items: its, changes, rejected, unknown };
}

// ---------------- Reply ----------------

const ASK_ORDER = [
  "booking.originCity", "booking.destinationCity", "booking.destinationType", "items", "description", "quantity", "unitPrice",
  "unitsPerCarton", "cartons", "unitWeightKg", "hsCode", "countryOfOrigin", "booking.pallets", "booking.cartons",
  "booking.grossWeightKg", "booking.declaredValue", "booking.readyToShipDate", "booking.sellerPriority",
  "booking.deliveryAppointmentBooked", "booking.sellerName",
];

export function orderMissing(missing: MissingField[]): MissingField[] {
  const rank = (p: string) => {
    const last = p.split(".").pop()!;
    const i = ASK_ORDER.indexOf(p) >= 0 ? ASK_ORDER.indexOf(p) : ASK_ORDER.indexOf(last);
    return i < 0 ? 99 : i;
  };
  return [...missing].sort((a, b) => rank(a.path) - rank(b.path));
}

const REPLY_SYSTEM = `You are CargoPilot, a friendly, efficient shipment-booking co-pilot. Write the assistant's next chat message to a seller.
You get FACTS computed by CargoPilot's rules engine. Use only these facts. Never invent numbers, carriers, prices or rule outcomes, and never decide pass/fail yourself.
Style: plain text, warm but brief (max ~110 words). Short lines; use "- " bullets for lists. No markdown headings, no bold.
- Briefly acknowledge what changed (if anything). If a change affected checks or the carrier, say so in one line.
- If anything was rejected, explain why in one line and ask again.
- If "unknownNow" is non-empty, the seller said they don't know those values. Say plainly that the related rulebook check will be flagged until they add it (they can add it later). Never say it doesn't matter.
- If "askFor" is non-empty: ask for exactly those details in one compact message (group naturally; give examples/allowed options where helpful). Don't ask for anything else.
- If "clarify" is non-empty, ask those clarifying questions.
- If the booking is complete: give the status headline, list up to 3 issues in plain words with the fix, state the recommended carrier with its reason in one line, and say the Flight Deck panel shows details and one-click fixes. If status is cleared and not yet confirmed, ask the seller to confirm.
- Never say the shipment is booked with a carrier or cleared by customs. A confirmed booking is "prepared and confirmed by you; the next step is to hand it to the carrier".
- Never use em dashes (—). Use commas, full stops or colons instead.`;

export function factsForReply(applied: Applied, view: BookingView, clarify: string[]) {
  const missing = orderMissing(view.missing);
  const complete = missing.length === 0;
  const issues = view.results
    .filter((r) => (r.status === "fail" && !r.keptReason) || r.status === "review")
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "Red" ? -1 : 1))
    .slice(0, 4)
    .map((r) => `${r.ruleId} ${r.severity}${r.itemLabel ? ` [${r.itemLabel}]` : ""}: ${r.explanation}${r.suggestions[0] ? ` Suggested fix: ${r.suggestions[0].label}.` : ""}`);
  const rec = view.carriers;
  return {
    changesApplied: applied.changes.map((c) => (c.old == null ? `${c.label}: ${fmt(c.new)}` : `${c.label}: ${fmt(c.old)} → ${fmt(c.new)}`)),
    rejected: applied.rejected,
    unknownNow: applied.unknown,
    clarify,
    askFor: missing.slice(0, 4).map((m) => m.label),
    stillMissingAfterThese: Math.max(0, missing.length - 4),
    complete,
    status: { readiness: view.readiness, headline: view.summary.headline },
    issues: complete ? issues : [],
    carrier: rec.recommended
      ? { recommended: carrierLabel(rec.recommended.carrier), cost: rec.recommended.totalCost != null ? gbp0(rec.recommended.totalCost) : null, reason: rec.reason, tradeOff: rec.tradeOff }
      : { unavailable: rec.unavailableReason },
    confirmed: Boolean(view.booking.sellerConfirmedAt),
  };
}

function templateReply(f: ReturnType<typeof factsForReply>): string {
  const lines: string[] = [];
  if (f.changesApplied.length) lines.push(`Updated: ${f.changesApplied.join("; ")}.`);
  for (const r of f.rejected) lines.push(r);
  for (const c of f.clarify) lines.push(c);
  if (f.askFor.length) {
    lines.push("To complete the booking I still need:");
    for (const a of f.askFor) lines.push(`- ${a}`);
  } else {
    lines.push(`Your booking is complete. ${f.status.headline}.`);
    for (const i of f.issues.slice(0, 3)) lines.push(`- ${i}`);
    if ("recommended" in f.carrier) lines.push(`Recommended: ${f.carrier.recommended}${f.carrier.cost ? ` (${f.carrier.cost})` : ""}.`);
    lines.push("The Flight Deck on the right shows the details and one-click fixes.");
  }
  return lines.join("\n");
}

export interface ChatTurn {
  booking: Booking;
  items: Item[];
  reply: string;
  changes: Applied["changes"];
  view: BookingView;
  aiError?: string;
}

export async function runChatTurn(
  booking: Booking,
  items: Item[],
  history: { role: "user" | "assistant"; content: string }[],
  message: string,
): Promise<ChatTurn> {
  const recent = history.slice(-8).map((m) => `${m.role === "user" ? "Seller" : "Assistant"}: ${m.content}`).join("\n");
  const prompt = `STATE:\n${JSON.stringify(stateForPrompt(booking, items), null, 1)}\n\nRECENT CONVERSATION:\n${recent || "(none)"}\n\nLATEST SELLER MESSAGE:\n${message}`;

  const started = Date.now();
  const elapsed = () => Date.now() - started;
  let ex: Extraction = {};
  let aiError: string | undefined;
  try {
    const extract = async (extra = "") => {
      const raw = await gemini({ system: EXTRACT_SYSTEM, prompt: prompt + extra, json: EXTRACTION_SCHEMA, timeoutMs: 20000 });
      const parsed = Extraction.safeParse(safeJson(raw));
      if (!parsed.success) console.error("extraction invalid", parsed.error.issues.slice(0, 3), raw.slice(0, 500));
      return parsed.success ? parsed.data : null;
    };
    let first = await extract();
    // Safety net: if a number the seller typed is missing from the extraction, ask once more and merge.
    const missed = first ? missingNumbers(message, first) : [];
    // Time budget: Vercel stops functions at 60s, so the second pass only runs if there is room.
    if ((!first || missed.length) && elapsed() < 20000) {
      const second = await extract(
        first ? `\n\nYour previous extraction missed these values from the message: ${missed.join(", ")}. Include every stated value.` : "\n\nReturn valid JSON only.",
      );
      first = first && second ? mergeExtractions(first, second) : (first ?? second);
    }
    if (first) ex = first;
    else aiError = "I couldn't read that reliably, so nothing was changed. Please try rephrasing.";
  } catch (e) {
    console.error("extraction failed", e);
    aiError = "The AI service didn't respond, so nothing was changed. Your booking is saved. Please try again.";
  }

  const applied = applyExtraction(booking, items, ex);
  const view = buildView(applied.booking, applied.items);
  const facts = factsForReply(applied, view, ex.clarify ?? []);

  let reply: string;
  if (aiError) reply = aiError;
  else if (elapsed() > 38000) reply = templateReply(facts);
  else {
    try {
      reply = (await gemini({ system: REPLY_SYSTEM, prompt: `RECENT CONVERSATION:\n${recent}\nSeller: ${message}\n\nFACTS:\n${JSON.stringify(facts, null, 1)}`, temperature: 0.4, timeoutMs: 12000 })).trim();
    } catch (e) {
      console.error("reply failed", e);
      reply = templateReply(facts);
    }
  }
  return { booking: applied.booking, items: applied.items, reply, changes: applied.changes, view, aiError };
}

/** Numbers in the seller's message that appear nowhere in the extraction (dates and codes count via their digits). */
export function missingNumbers(message: string, ex: Extraction): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "number") found.add(String(v));
    else if (typeof v === "string") for (const m of v.match(/\d+(?:\.\d+)?/g) ?? []) found.add(String(Number(m)));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(ex);
  const stated = (message.match(/\d[\d,]*(?:\.\d+)?(k\b)?/gi) ?? []).map((m) => {
    const k = /k$/i.test(m);
    const n = Number(m.replace(/[,k]/gi, ""));
    return String(k ? n * 1000 : n);
  });
  return [...new Set(stated)].filter((n) => !found.has(n));
}

/** Union of two extractions; the first one wins where both have a value. */
export function mergeExtractions(a: Extraction, b: Extraction): Extraction {
  const items = [...(a.items ?? [])];
  (b.items ?? []).forEach((it, i) => {
    items[i] = items[i] ? { ...it, ...items[i] } : it;
  });
  return {
    ...b,
    ...a,
    booking: { ...(b.booking ?? {}), ...(a.booking ?? {}) },
    items,
    unknownFields: [...new Set([...(a.unknownFields ?? []), ...(b.unknownFields ?? [])])],
    clarify: a.clarify ?? b.clarify,
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    try {
      return m ? JSON.parse(m[0]) : null;
    } catch {
      return null;
    }
  }
}

export function emptyBooking(): Booking {
  return {
    bookingId: `CP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    sellerName: null, originCity: null, originCountry: null, destinationCity: null, destinationCountry: null,
    destinationType: null, readyToShipDate: null, sellerPriority: null, pallets: null, cartons: null,
    declaredValue: null, currency: "GBP", grossWeightKg: null, deliveryAppointmentBooked: null,
    mode: "chat",
  };
}
