import { describe, expect, it } from "vitest";
import { applyExtraction, emptyBooking, Extraction, factsForReply, mergeExtractions, missingNumbers } from "@/lib/server/chat";
import { nextFutureAnniversary } from "@/lib/rules";
import { buildView } from "@/lib/view";

describe("past ready-to-ship date", () => {
  it("suggests the same day in the next year that is still ahead", () => {
    expect(nextFutureAnniversary("2025-10-22", "2026-10-26")).toBe("2027-10-22");
    expect(nextFutureAnniversary("2025-11-05", "2026-10-26")).toBe("2026-11-05");
    // 29 Feb doesn't exist in 2025–2027, so no guess is offered (the date picker is still there).
    expect(nextFutureAnniversary("2024-02-29", "2026-01-10")).toBeNull();
  });

  it("is held back in chat, not saved, until the seller confirms or corrects it", () => {
    const held = applyExtraction(emptyBooking(), [], { booking: { readyToShipDate: "23-11-2024" } });
    expect(held.booking.readyToShipDate).toBeNull();
    expect(held.booking.pendingReadyDate).toEqual({ value: "2024-11-23", suggested: expect.stringMatching(/-11-23$/) });
    const facts = factsForReply(held, buildView(held.booking, held.items), []);
    expect(facts.heldDate?.date).toBe("23-11-2024");
    expect(facts.askFor).not.toContain("Ready-to-ship date");

    // Accepting the suggestion saves it and clears the pending date.
    const fixed = applyExtraction(held.booking, held.items, { booking: { readyToShipDate: held.booking.pendingReadyDate!.suggested! } });
    expect(fixed.booking.readyToShipDate).toBe(held.booking.pendingReadyDate!.suggested);
    expect(fixed.booking.pendingReadyDate).toBeNull();

    // Explicitly keeping the past date saves it, and R-10 then flags it.
    const kept = applyExtraction(held.booking, held.items, { booking: { readyToShipDate: "23-11-2024" }, keepPastDate: true });
    expect(kept.booking.readyToShipDate).toBe("2024-11-23");
    expect(buildView(kept.booking, kept.items).results.find((r) => r.ruleId === "R-10")!.status).toBe("fail");
  });

  it("R-10 offers the corrected date as a one-click fix", () => {
    const view = buildView({ ...emptyBooking(), readyToShipDate: "2025-11-05" }, [], new Date("2026-10-26T09:00:00Z"));
    const r10 = view.results.find((r) => r.ruleId === "R-10")!;
    expect(r10.explanation).toContain("Did you mean 05-11-2026?");
    expect(r10.suggestions[0]).toMatchObject({ value: "2026-11-05" });
  });
});

describe("extraction safety net", () => {
  const msg = "2 pallets, 700 kg gross, declared value £6,000, ready 20-11-2026. 1,200 bottles at £5, HS 732393, 0.45 kg each, 10000mAh";
  it("spots stated numbers the extraction dropped", () => {
    const ex = { booking: { pallets: 2, grossWeightKg: 700, readyToShipDate: "20-11-2026" }, items: [{ quantity: 1200, unitPrice: 5, description: "bottle 10000mAh" }] };
    expect(missingNumbers(msg, ex).sort()).toEqual(["0.45", "6000", "732393"]);
  });
  it("merges a second pass without overriding the first", () => {
    const m = mergeExtractions({ booking: { pallets: 2 }, items: [{ quantity: 1200 }] }, { booking: { pallets: 3, declaredValue: 6000 }, items: [{ quantity: 1, hsCode: "732393" }] });
    expect(m.booking).toEqual({ pallets: 2, declaredValue: 6000 });
    expect(m.items).toEqual([{ quantity: 1200, hsCode: "732393" }]);
  });
});

describe("chat extraction parsing", () => {
  it("tolerates nulls, numeric strings and numbers-as-text without losing other fields", () => {
    const p = Extraction.safeParse({
      booking: { originCity: "Leeds", declaredValue: "£6,000", deliveryAppointmentBooked: null, pallets: "two" },
      items: [{ ref: null, sku: "BTL-01", hsCode: 732393, quantity: "1,200", unitPrice: 5 }],
      clarify: null,
    });
    expect(p.success).toBe(true);
    expect(p.data!.booking).toMatchObject({ originCity: "Leeds", declaredValue: 6000 });
    expect(p.data!.booking!.pallets).toBeUndefined(); // "two" dropped, not guessed
    expect(p.data!.items![0]).toMatchObject({ sku: "BTL-01", hsCode: "732393", quantity: 1200 });
  });
});

describe("applying extracted facts", () => {
  it("fills a booking, derives country, and keeps everything on a later one-field change", () => {
    const first = applyExtraction(emptyBooking(), [], {
      booking: { originCity: "Leeds", destinationCity: "Rotterdam", pallets: 2, declaredValue: 6000 },
      items: [{ sku: "BTL-01", description: "Steel bottle", quantity: 1200, unitPrice: 5 }],
    });
    expect(first.booking.destinationCountry).toBe("Netherlands");
    expect(first.items).toHaveLength(1);

    const second = applyExtraction(first.booking, first.items, { booking: { pallets: 3 } });
    expect(second.booking.pallets).toBe(3);
    expect(second.booking.declaredValue).toBe(6000);
    expect(second.items[0].quantity).toBe(1200);
    expect(second.changes).toEqual([expect.objectContaining({ path: "booking.pallets", old: 2, new: 3 })]);
  });

  it("rejects values outside the allowed lists instead of storing them", () => {
    const r = applyExtraction(emptyBooking(), [], { booking: { destinationCity: "Munich" } });
    expect(r.booking.destinationCity).toBeNull();
    expect(r.rejected[0]).toMatch(/Destination city/);
  });

  it("updates an existing item instead of duplicating it", () => {
    const a = applyExtraction(emptyBooking(), [], { items: [{ sku: "MUG-01", description: "Mug", quantity: 100 }] });
    const b = applyExtraction(a.booking, a.items, { items: [{ ref: 1, quantity: 120 }] });
    expect(b.items).toHaveLength(1);
    expect(b.items[0].quantity).toBe(120);
  });
});
