import { describe, expect, it } from "vitest";
import { buildCarrierEmail } from "@/lib/carrierEmail";
import { buildView } from "@/lib/view";
import type { Booking, Item } from "@/lib/types";

const NOW = new Date("2026-10-25T11:00:00Z");
const booking: Booking = {
  bookingId: "BK-001", sellerName: "Northfield Goods", originCity: "Manchester", originCountry: "United Kingdom",
  destinationCity: "Frankfurt", destinationCountry: "Germany", destinationType: "Warehouse", readyToShipDate: "2026-11-05",
  sellerPriority: "Cheapest", pallets: 3, cartons: 90, declaredValue: 5400, currency: "GBP", grossWeightKg: 620,
  deliveryAppointmentBooked: true,
};
const items: Item[] = [
  { sku: "MUG-01", description: "Ceramic coffee mug, 350 ml", hsCode: "691200", quantity: 1080, unitPrice: 5, unitsPerCarton: 12, cartons: 90, unitWeightKg: 0.5, countryOfOrigin: "United Kingdom" },
];

describe("carrier booking email", () => {
  const view = buildView(booking, items, NOW);

  it("summarises the checked booking for the chosen carrier", () => {
    const e = buildCarrierEmail(view, { replyTo: "ops@northfield.example" });
    expect(e.subject).toBe("Booking request BK-001: Manchester to Frankfurt, 3 pallets, collection 05-11-2026");
    expect(e.text).toContain("Service requested: Carrier A · Road economy");
    expect(e.text).toContain("Quoted rate: £180 per pallet, £540 in total");
    expect(e.text).toContain("Gross weight: 620 kg (206.7 kg per pallet)");
    expect(e.text).toContain("- 1,080 x Ceramic coffee mug, 350 ml (MUG-01), 90 cartons, HS 691200, made in United Kingdom");
    expect(e.text).toContain("Please reply to ops@northfield.example to confirm.");
    expect(e.text).not.toContain("—");
  });

  it("escapes the free-text note in the HTML version", () => {
    const e = buildCarrierEmail(view, { replyTo: "ops@northfield.example", note: '<script>alert("x")</script> Tail-lift needed' });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.text).toContain("Note from the shipper:");
  });
});
