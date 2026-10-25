import type { Carrier, DestinationType, SellerPriority, Severity } from "./types";

// Values copied from Case2_Shipment_Booking_Test_Data_Format.xlsx ("Allowed values" sheet).
export const ORIGIN_COUNTRY = "United Kingdom";
export const ORIGIN_CITIES = ["London", "Manchester", "Birmingham", "Leeds"];
export const DESTINATIONS: Record<string, string[]> = {
  Germany: ["Berlin", "Frankfurt", "Hamburg"],
  France: ["Paris", "Lyon"],
  Netherlands: ["Amsterdam", "Rotterdam"],
};
export const DESTINATION_COUNTRIES = Object.keys(DESTINATIONS);
export const DESTINATION_CITIES = Object.values(DESTINATIONS).flat();
export const CURRENCY = "GBP";
export const ITEM_ORIGIN_COUNTRIES = ["United Kingdom", "China", "India", "Vietnam", "Turkey", "Germany"];
export const DESTINATION_TYPES: DestinationType[] = ["Warehouse", "Business address"];
export const SELLER_PRIORITIES: SellerPriority[] = ["Cheapest", "Fastest", "Most reliable", "Balanced"];

export function countryForCity(city: string | null): string | null {
  if (!city) return null;
  for (const [country, cities] of Object.entries(DESTINATIONS)) {
    if (cities.includes(city)) return country;
  }
  return null;
}

// "Carrier options" sheet — fixed, judges use exactly this rate card.
const RATE_CARD: Omit<Carrier, "id">[] = [
  { carrier: "Carrier A", service: "Road economy", originCountry: "United Kingdom", destinationCountry: "Germany", pricePerPallet: 180, transitDays: 5, onTimeRate: 92, maxWeightPerPalletKg: 500 },
  { carrier: "Carrier B", service: "Road standard", originCountry: "United Kingdom", destinationCountry: "Germany", pricePerPallet: 220, transitDays: 3, onTimeRate: 95, maxWeightPerPalletKg: 750 },
  { carrier: "Carrier C", service: "Road express", originCountry: "United Kingdom", destinationCountry: "Germany", pricePerPallet: 340, transitDays: 2, onTimeRate: 98, maxWeightPerPalletKg: 400 },
  { carrier: "Carrier A", service: "Road economy", originCountry: "United Kingdom", destinationCountry: "France", pricePerPallet: 170, transitDays: 5, onTimeRate: 92, maxWeightPerPalletKg: 500 },
  { carrier: "Carrier B", service: "Road standard", originCountry: "United Kingdom", destinationCountry: "France", pricePerPallet: 210, transitDays: 3, onTimeRate: 95, maxWeightPerPalletKg: 750 },
  { carrier: "Carrier C", service: "Road express", originCountry: "United Kingdom", destinationCountry: "France", pricePerPallet: 330, transitDays: 2, onTimeRate: 98, maxWeightPerPalletKg: 400 },
  { carrier: "Carrier A", service: "Road economy", originCountry: "United Kingdom", destinationCountry: "Netherlands", pricePerPallet: 160, transitDays: 5, onTimeRate: 92, maxWeightPerPalletKg: 500 },
  { carrier: "Carrier B", service: "Road standard", originCountry: "United Kingdom", destinationCountry: "Netherlands", pricePerPallet: 200, transitDays: 3, onTimeRate: 95, maxWeightPerPalletKg: 750 },
  { carrier: "Carrier C", service: "Road express", originCountry: "United Kingdom", destinationCountry: "Netherlands", pricePerPallet: 320, transitDays: 2, onTimeRate: 98, maxWeightPerPalletKg: 400 },
];

export const CARRIERS: Carrier[] = RATE_CARD.map((c) => ({
  ...c,
  id: `${c.carrier} · ${c.service} · ${c.destinationCountry}`,
}));

// "Rulebook" sheet — fixed.
export const RULEBOOK: { id: string; rule: string; severity: Severity; short: string }[] = [
  { id: "R-01", short: "HS code", rule: "Every item must have an HS code of at least 6 digits", severity: "Red" },
  { id: "R-02", short: "Declared value", rule: "Total declared value must equal the sum of quantity × unit price across all items (within 1%)", severity: "Red" },
  { id: "R-03", short: "Carton packing", rule: "For each item, units per carton × cartons must equal quantity", severity: "Red" },
  { id: "R-04", short: "Carton total", rule: "Total cartons on the booking must equal the sum of cartons across all items", severity: "Red" },
  { id: "R-05", short: "Pallet weight", rule: "Weight per pallet (total gross weight ÷ pallets) must not exceed the chosen carrier's max weight per pallet", severity: "Red" },
  { id: "R-06", short: "Restricted goods", rule: "No lithium batteries, aerosols or flammable liquids", severity: "Red" },
  { id: "R-07", short: "Gross weight", rule: "Total gross weight must be at least the sum of unit weight × quantity across all items", severity: "Amber" },
  { id: "R-08", short: "Delivery appointment", rule: "Shipments to a warehouse must have a delivery appointment booked", severity: "Amber" },
  { id: "R-09", short: "Country of origin", rule: "Every item must have a country of origin", severity: "Amber" },
  { id: "R-10", short: "Ready-to-ship date", rule: "Ready to ship date must not be in the past", severity: "Amber" },
];

export const RULE_BY_ID = Object.fromEntries(RULEBOOK.map((r) => [r.id, r]));

// Product decisions the case leaves open — shown on the "How CargoPilot decides" page.
export const R02_TOLERANCE = 0.01; // |declared − calculated| ÷ calculated
export const BALANCED_WEIGHTS = { cost: 0.4, speed: 0.3, reliability: 0.3 };
export const TIMEZONE = "Europe/London";

export const BOOKING_FIELD_LABELS: Record<string, string> = {
  bookingId: "Booking ID",
  sellerName: "Seller name",
  originCity: "Origin city",
  originCountry: "Origin country",
  destinationCity: "Destination city",
  destinationCountry: "Destination country",
  destinationType: "Destination type (Warehouse or Business address)",
  readyToShipDate: "Ready-to-ship date",
  sellerPriority: "Seller priority (Cheapest, Fastest, Most reliable or Balanced)",
  pallets: "Number of pallets",
  cartons: "Total cartons",
  declaredValue: "Total declared value (GBP)",
  currency: "Currency",
  grossWeightKg: "Total gross weight (kg)",
  deliveryAppointmentBooked: "Delivery appointment booked (Yes/No)",
};

export const ITEM_FIELD_LABELS: Record<string, string> = {
  sku: "SKU",
  description: "Description",
  hsCode: "HS code",
  quantity: "Quantity (units)",
  unitPrice: "Unit price (GBP)",
  unitsPerCarton: "Units per carton",
  cartons: "Cartons",
  unitWeightKg: "Unit weight (kg)",
  countryOfOrigin: "Country of origin",
};
