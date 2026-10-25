import { describe, expect, it } from "vitest";
import { buildView } from "@/lib/view";
import { recommendCarrier } from "@/lib/carriers";
import { screenDescription } from "@/lib/hazard";
import type { Booking, Item } from "@/lib/types";

// "Now" fixed to 25 Oct 2026, 12:00 UK.
const NOW = new Date("2026-10-25T11:00:00Z");

// The template's example row — a clean booking.
const base = (): Booking => ({
  bookingId: "BK-001",
  sellerName: "Northfield Goods",
  originCity: "Manchester",
  originCountry: "United Kingdom",
  destinationCity: "Frankfurt",
  destinationCountry: "Germany",
  destinationType: "Warehouse",
  readyToShipDate: "2026-11-05",
  sellerPriority: "Cheapest",
  pallets: 3,
  cartons: 90,
  declaredValue: 5400,
  currency: "GBP",
  grossWeightKg: 620,
  deliveryAppointmentBooked: true,
});
const mug = (): Item => ({
  sku: "MUG-01", description: "Ceramic coffee mug, 350 ml", hsCode: "691200", quantity: 1080, unitPrice: 5,
  unitsPerCarton: 12, cartons: 90, unitWeightKg: 0.5, countryOfOrigin: "United Kingdom",
});

const status = (b: Booking, items: Item[], rule: string) =>
  buildView(b, items, NOW).results.filter((r) => r.ruleId === rule).map((r) => r.status);

describe("clean template example", () => {
  it("passes all 10 rules and is cleared", () => {
    const v = buildView(base(), [mug()], NOW);
    expect(v.results.every((r) => r.status === "pass")).toBe(true);
    expect(v.readiness).toBe("cleared");
    expect(v.summary.passed).toBe(10);
    expect(v.carriers.recommended?.carrier.carrier).toBe("Carrier A");
  });
});

describe("R-01 HS code", () => {
  it("fails when blank, short or non-numeric; passes at 6+ digits", () => {
    expect(status(base(), [{ ...mug(), hsCode: null }], "R-01")).toEqual(["fail"]);
    expect(status(base(), [{ ...mug(), hsCode: "69120" }], "R-01")).toEqual(["fail"]);
    expect(status(base(), [{ ...mug(), hsCode: "6912AB" }], "R-01")).toEqual(["fail"]);
    expect(status(base(), [{ ...mug(), hsCode: "6912.00" }], "R-01")).toEqual(["pass"]);
    expect(status(base(), [{ ...mug(), hsCode: "090121" }], "R-01")).toEqual(["pass"]);
  });
});

describe("R-02 declared value", () => {
  it("passes exact and within 1%, fails beyond", () => {
    expect(status({ ...base(), declaredValue: 5400 }, [mug()], "R-02")).toEqual(["pass"]);
    expect(status({ ...base(), declaredValue: 5454 }, [mug()], "R-02")).toEqual(["pass"]); // exactly 1%
    expect(status({ ...base(), declaredValue: 5455 }, [mug()], "R-02")).toEqual(["fail"]);
    expect(status({ ...base(), declaredValue: 4500 }, [mug()], "R-02")).toEqual(["fail"]);
  });
  it("explains the calculation and offers a fix", () => {
    const r = buildView({ ...base(), declaredValue: 4500 }, [{ ...mug(), quantity: 1000, unitsPerCarton: 10, cartons: 100 }], NOW)
      .results.find((x) => x.ruleId === "R-02")!;
    expect(r.calculation).toContain("£5,000.00");
    expect(r.calculation).toContain("difference £500.00");
    expect(r.suggestions[0]).toMatchObject({ path: "booking.declaredValue", value: 5000 });
  });
  it("is not evaluable when a price is missing", () => {
    expect(status(base(), [{ ...mug(), unitPrice: null }], "R-02")).toEqual(["not_evaluable"]);
  });
});

describe("R-03 packing", () => {
  it("checks each item", () => {
    expect(status(base(), [{ ...mug(), quantity: 1000 }], "R-03")).toEqual(["fail"]);
    const two = [mug(), { ...mug(), sku: "MUG-02", quantity: 50, unitsPerCarton: 12, cartons: 4 }];
    expect(status({ ...base(), cartons: 94 }, two, "R-03")).toEqual(["pass", "fail"]);
  });
});

describe("R-04 carton total", () => {
  it("compares booking cartons with the item sum", () => {
    expect(status({ ...base(), cartons: 95 }, [mug()], "R-04")).toEqual(["fail"]);
    expect(status({ ...base(), cartons: 90 }, [mug()], "R-04")).toEqual(["pass"]);
  });
});

describe("R-05 pallet weight", () => {
  it("passes below and at the limit, fails above", () => {
    // Cheapest to Germany = Carrier A, 500 kg limit.
    expect(status({ ...base(), grossWeightKg: 1500 }, [mug()], "R-05")).toEqual(["pass"]); // exactly 500
    expect(status({ ...base(), grossWeightKg: 1503 }, [mug()], "R-05")).toEqual(["fail"]);
  });
  it("recommends an eligible carrier and offers fixes when the preferred one is over the limit", () => {
    const v = buildView({ ...base(), grossWeightKg: 1800 }, [mug()], NOW); // 600 kg/pallet
    expect(v.carriers.preferred?.carrier.carrier).toBe("Carrier A");
    expect(v.carriers.recommended?.carrier.carrier).toBe("Carrier B");
    const r = v.results.find((x) => x.ruleId === "R-05")!;
    expect(r.status).toBe("fail");
    expect(r.suggestions.map((s) => s.path)).toEqual(["booking.pallets", "booking.chosenCarrier"]);
    expect(r.suggestions[0]).toMatchObject({ value: 4 });
  });
  it("passes once the seller picks the eligible carrier", () => {
    const b = { ...base(), grossWeightKg: 1800, chosenCarrier: "Carrier B · Road standard · Germany" };
    expect(status(b, [mug()], "R-05")).toEqual(["pass"]);
  });
  it("fails when no carrier can take the load", () => {
    const v = buildView({ ...base(), grossWeightKg: 3000 }, [mug()], NOW); // 1000 kg/pallet
    expect(v.carriers.recommended).toBeNull();
    expect(v.results.find((x) => x.ruleId === "R-05")!.status).toBe("fail");
  });
  it("does not divide by zero pallets", () => {
    expect(status({ ...base(), pallets: 0 }, [mug()], "R-05")).toEqual(["fail"]);
  });
});

describe("R-06 restricted goods", () => {
  it("screens descriptions", () => {
    expect(screenDescription("Lithium-ion power bank 10000mAh").level).toBe("definite");
    expect(screenDescription("Deodorant aerosol 150ml").level).toBe("definite");
    expect(screenDescription("Paint thinner 1L").level).toBe("definite");
    expect(screenDescription("Wireless earbuds").level).toBe("possible");
    expect(screenDescription("Eau de parfum 50ml").level).toBe("possible");
    expect(screenDescription("Non-flammable cotton tote bag").level).toBe("clear");
    expect(screenDescription("Ceramic coffee mug, 350 ml").level).toBe("clear");
  });
  it("fails definite, asks for review on possible, and respects the seller's answer", () => {
    expect(status(base(), [{ ...mug(), description: "Lithium battery pack" }], "R-06")).toEqual(["fail"]);
    expect(status(base(), [{ ...mug(), description: "Bluetooth speaker" }], "R-06")).toEqual(["review"]);
    expect(status({ ...base(), hazardConfirmations: { "0": "none" } }, [{ ...mug(), description: "Bluetooth speaker" }], "R-06")).toEqual(["pass"]);
    expect(status({ ...base(), hazardConfirmations: { "0": "contains" } }, [{ ...mug(), description: "Bluetooth speaker" }], "R-06")).toEqual(["fail"]);
  });
});

describe("R-07 gross weight", () => {
  it("must cover the goods", () => {
    expect(status({ ...base(), grossWeightKg: 539 }, [mug()], "R-07")).toEqual(["fail"]);
    expect(status({ ...base(), grossWeightKg: 540 }, [mug()], "R-07")).toEqual(["pass"]);
  });
});

describe("R-08 delivery appointment", () => {
  it("only applies to warehouses", () => {
    expect(status({ ...base(), deliveryAppointmentBooked: false }, [mug()], "R-08")).toEqual(["fail"]);
    expect(status({ ...base(), destinationType: "Business address", deliveryAppointmentBooked: false }, [mug()], "R-08")).toEqual(["pass"]);
  });
  it("is amber, so it doesn't ground the shipment", () => {
    expect(buildView({ ...base(), deliveryAppointmentBooked: false }, [mug()], NOW).readiness).toBe("attention");
  });
  it("can be acknowledged with a reason", () => {
    const v = buildView({ ...base(), deliveryAppointmentBooked: false, keptOriginal: { "R-08": "Warehouse accepts walk-ins" } }, [mug()], NOW);
    expect(v.readiness).toBe("cleared");
  });
});

describe("R-09 country of origin", () => {
  it("fails when blank", () => {
    expect(status(base(), [{ ...mug(), countryOfOrigin: null }], "R-09")).toEqual(["fail"]);
  });
});

describe("R-10 ready date", () => {
  it("past fails, today and future pass (UK date)", () => {
    expect(status({ ...base(), readyToShipDate: "2026-10-24" }, [mug()], "R-10")).toEqual(["fail"]);
    expect(status({ ...base(), readyToShipDate: "2026-10-25" }, [mug()], "R-10")).toEqual(["pass"]);
    expect(status({ ...base(), readyToShipDate: "2026-10-26" }, [mug()], "R-10")).toEqual(["pass"]);
  });
});

describe("readiness", () => {
  it("red issue grounds the shipment even if kept with a reason", () => {
    const v = buildView({ ...base(), cartons: 95, keptOriginal: { "R-04": "trust me" } }, [mug()], NOW);
    expect(v.readiness).toBe("grounded");
  });
  it("missing info is never 'cleared'", () => {
    expect(buildView({ ...base(), grossWeightKg: null }, [mug()], NOW).readiness).toBe("attention");
  });
});

describe("carrier matchmaker", () => {
  const b = (priority: Booking["sellerPriority"]) => ({ ...base(), sellerPriority: priority });
  it("ranks by each priority with a runner-up", () => {
    expect(recommendCarrier(b("Cheapest")).recommended?.carrier.carrier).toBe("Carrier A");
    expect(recommendCarrier(b("Fastest")).recommended?.carrier.carrier).toBe("Carrier C");
    expect(recommendCarrier(b("Most reliable")).recommended?.carrier.carrier).toBe("Carrier C");
    const bal = recommendCarrier(b("Balanced"));
    expect(bal.recommended?.carrier.carrier).toBe("Carrier B");
    expect(Math.round(bal.recommended!.balancedScore!)).toBe(65);
    expect(bal.runnerUp?.carrier.carrier).toBe("Carrier C");
    expect(bal.tradeOff).toContain("Runner-up");
  });
  it("uses total cost = pallets × price", () => {
    expect(recommendCarrier(b("Cheapest")).recommended?.totalCost).toBe(540);
  });
  it("never recommends an over-limit carrier", () => {
    // 450 kg/pallet: Carrier C (400 kg) is out.
    const r = recommendCarrier({ ...base(), sellerPriority: "Fastest", grossWeightKg: 1350 });
    expect(r.preferred?.carrier.carrier).toBe("Carrier C");
    expect(r.recommended?.carrier.carrier).toBe("Carrier B");
  });
});
