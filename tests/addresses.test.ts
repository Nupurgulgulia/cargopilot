import { describe, expect, it } from "vitest";
import { addressGaps, addressLine, normaliseAddress } from "@/lib/addresses";
import { applyChange, ChangeError } from "@/lib/changes";
import { buildCarrierEmail } from "@/lib/carrierEmail";
import { buildView } from "@/lib/view";
import type { Address, Booking, Item } from "@/lib/types";

const site = (over: Partial<Address> = {}): Address => ({
  company: "Northfield Goods", street: "12 Mill Lane", postcode: "m1 2ab", contactName: "Asha Rao",
  phone: "+44 161 555 0101", email: "asha@northfield.example", notes: "Mon-Fri 8-16", ...over,
});

const booking: Booking = {
  bookingId: "BK-001", sellerName: "Northfield Goods", originCity: "Manchester", originCountry: "United Kingdom",
  destinationCity: "Frankfurt", destinationCountry: "Germany", destinationType: "Warehouse", readyToShipDate: "2026-11-05",
  sellerPriority: "Cheapest", pallets: 3, cartons: 90, declaredValue: 5400, currency: "GBP", grossWeightKg: 620,
  deliveryAppointmentBooked: true,
};
const items: Item[] = [
  { sku: "MUG-01", description: "Ceramic coffee mug", hsCode: "691200", quantity: 1080, unitPrice: 5, unitsPerCarton: 12, cartons: 90, unitWeightKg: 0.5, countryOfOrigin: "United Kingdom" },
];

describe("addresses", () => {
  it("cleans input and rejects bad email or phone", () => {
    const ok = normaliseAddress(site({ street: "  12   Mill Lane " }));
    expect("address" in ok && ok.address).toMatchObject({ street: "12 Mill Lane", postcode: "M1 2AB" });
    const bad = normaliseAddress(site({ email: "not-an-email", phone: "abc" }));
    expect("errors" in bad && bad.errors).toHaveLength(2);
  });

  it("lists what's missing on each side, ignoring the optional notes", () => {
    expect(addressGaps(booking)).toHaveLength(12);
    expect(addressGaps({ ...booking, collection: site(), delivery: site({ phone: null, notes: null }) })).toEqual(["Delivery: Contact phone"]);
  });

  it("saves a whole block or one field at a time, and validates both", () => {
    const withBlock = applyChange(booking, items, "collection", site()).booking;
    expect(addressLine(withBlock.collection, "Manchester")).toBe("Northfield Goods, 12 Mill Lane, M1 2AB Manchester");
    const withField = applyChange(withBlock, items, "collection.phone", "+44 161 555 0199").booking;
    expect(withField.collection?.phone).toBe("+44 161 555 0199");
    expect(withField.collection?.street).toBe("12 Mill Lane");
    expect(() => applyChange(booking, items, "delivery.email", "nope")).toThrow(ChangeError);
  });

  it("puts both sites and contacts in the carrier email", () => {
    const collection = (normaliseAddress(site()) as { address: Address }).address;
    const delivery = site({ company: "Lager Frankfurt GmbH", street: "Hafenstrasse 5", postcode: "60327", contactName: "Jonas Weber", phone: "+49 69 1234567", email: "inbound@lager.example", notes: "Ref PO-8812" });
    const view = buildView({ ...booking, collection, delivery }, items, new Date("2026-10-25T11:00:00Z"));
    const e = buildCarrierEmail(view, { replyTo: "ops@northfield.example" });
    expect(e.text).toContain("Collection address: Northfield Goods, 12 Mill Lane, M1 2AB Manchester, United Kingdom");
    expect(e.text).toContain("Collection contact: Asha Rao · +44 161 555 0101 · asha@northfield.example");
    expect(e.text).toContain("Delivery address: Lager Frankfurt GmbH, Hafenstrasse 5, 60327 Frankfurt, Germany");
    expect(e.text).toContain("Delivery notes: Ref PO-8812");
  });
});
