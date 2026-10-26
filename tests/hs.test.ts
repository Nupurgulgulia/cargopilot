import { describe, expect, it } from "vitest";
import { applyChange } from "@/lib/changes";
import { clip } from "@/lib/server/chat";

describe("clip", () => {
  it("never ends mid-word", () => {
    const t = "Cases and containers; n.e.c. in heading 4202, with outer surface of sheeting of plastics or of textile materials";
    expect(clip(t, 90)).toBe("Cases and containers; n.e.c. in heading 4202, with outer surface of sheeting of plastics…");
    expect(clip("short text", 90)).toBe("short text");
  });
});
import { hsDescription, shortlist, tokens } from "@/lib/hsCodes";
import type { Booking, Item } from "@/lib/types";

describe("HS 2022 code list", () => {
  it("knows real six-digit codes and rejects invented ones", () => {
    expect(hsDescription("691200")).toMatch(/^Ceramic tableware/);
    expect(hsDescription("6912.00")).toMatch(/^Ceramic tableware/);
    expect(hsDescription("850760")).toMatch(/lithium-ion/);
    expect(hsDescription("999999")).toBeNull();
    expect(hsDescription("6912")).toBeNull();
  });

  it("shortlists codes that share words with the description", () => {
    expect(tokens("Ceramic coffee mugs, 350 ml")).toEqual(["ceramic", "coffee", "mug"]);
    expect(shortlist("lithium-ion power bank batteries").map((c) => c.code)).toContain("850760");
    expect(shortlist("wool scarf").map((c) => c.code)).toContain("621420");
    expect(shortlist("")).toEqual([]);
  });
});

describe("HS suggestions stay with their item", () => {
  const b = { hsSuggested: { "0": { code: "691200", description: "mugs" }, "1": { code: "610910", description: "tees" } } } as unknown as Booking;
  const items = [{ description: "Mug" }, { description: "T-shirt" }] as Item[];

  it("shifts when an earlier item is removed", () => {
    expect(applyChange(b, items, "items.0", null).booking.hsSuggested).toEqual({ "0": { code: "610910", description: "tees" } });
  });

  it("is dropped when the item's description changes", () => {
    expect(applyChange(b, items, "items.1.description", "Hoodie").booking.hsSuggested).toEqual({ "0": { code: "691200", description: "mugs" } });
  });
});
