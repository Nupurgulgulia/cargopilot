// Cargo labels as data: which labels to print and why printing might be blocked.
// Labels use existing booking data only. No hazard marks, dangerous-goods symbols or customs wording.
import { chosenCarrier } from "./carrierEmail";
import { carrierLabel } from "./carriers";
import { isoToDisplay, plural, round2 } from "./format";
import type { Booking, BookingView } from "./types";

export type LabelFormat = "a6" | "4x6" | "a4";
export type LabelSelection = "all" | "pallets" | "cartons";
export const LABEL_FORMATS: { key: LabelFormat; label: string }[] = [
  { key: "a6", label: "A6 (105 × 148 mm), one per page" },
  { key: "4x6", label: "4 × 6 in thermal, one per page" },
  { key: "a4", label: "A4, 4 labels per sheet with crop marks" },
];
export const LABEL_NOTE = "Check labelling requirements with your carrier and the destination country.";

export interface CargoLabel {
  kind: "Pallet" | "Carton";
  n: number;
  of: number;
  /** Encoded in the barcode: booking reference + package number. */
  code: string;
  bookingRef: string;
  seller: string;
  from: string[];
  to: string[];
  contact: string;
  route: string;
  carrier: string;
  collection: string;
  weight: string;
  totals: string;
  note: string | null;
}

export interface LabelBlock {
  message: string;
  /** Where the one-click fix goes. */
  fix: "addresses" | "flightdeck";
}

const blank = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");

export function labelBlockers(view: BookingView): LabelBlock[] {
  const b = view.booking, out: LabelBlock[] = [];
  for (const [side, a] of [["Collection", b.collection], ["Delivery", b.delivery]] as const) {
    const missing = !a ? ["address"] : [blank(a.company) && "company", blank(a.street) && "street", blank(a.postcode) && "postcode"].filter(Boolean);
    if (missing.length) out.push({ message: `${side} ${missing.join(", ")} missing.`, fix: "addresses" });
  }
  if (b.delivery && (blank(b.delivery.contactName) || blank(b.delivery.phone))) out.push({ message: "Delivery contact name and phone are needed on every label.", fix: "addresses" });
  if (!b.pallets || b.pallets < 1 || !Number.isInteger(b.pallets)) out.push({ message: "Set a whole number of pallets (at least 1).", fix: "flightdeck" });
  if (!b.cartons || b.cartons < 1 || !Number.isInteger(b.cartons)) out.push({ message: "Set a whole number of cartons (at least 1).", fix: "flightdeck" });
  if (b.pallets && b.cartons && b.cartons < b.pallets) out.push({ message: `${b.cartons} cartons on ${b.pallets} pallets: every pallet needs at least one carton.`, fix: "flightdeck" });
  const failed = (id: string) => view.results.some((r) => r.ruleId === id && r.status === "fail");
  if (failed("R-04")) out.push({ message: "Pallet and carton counts don't agree (R-04): the booking's carton total differs from the items.", fix: "flightdeck" });
  if (failed("R-05")) out.push({ message: "Weight per pallet is over the carrier's limit (R-05).", fix: "flightdeck" });
  if (blank(b.bookingId)) out.push({ message: "The booking needs a reference to print on the labels.", fix: "flightdeck" });
  return out;
}

const place = (b: Booking, side: "collection" | "delivery") => {
  const a = b[side];
  const city = side === "collection" ? b.originCity : b.destinationCity;
  const country = side === "collection" ? b.originCountry ?? "United Kingdom" : b.destinationCountry;
  return [a?.company ?? "", a?.street ?? "", [a?.postcode, city].filter(Boolean).join(" "), (country ?? "").toUpperCase()].filter(Boolean);
};

export function buildLabels(view: BookingView, which: LabelSelection = "all"): CargoLabel[] {
  const b = view.booking;
  const carrier = chosenCarrier(view);
  const ref = b.bookingId ?? "";
  const common = {
    bookingRef: ref,
    seller: b.sellerName ?? "",
    from: place(b, "collection"),
    to: place(b, "delivery"),
    contact: [b.delivery?.contactName, b.delivery?.phone].filter(Boolean).join(" · "),
    route: `${b.originCity ?? "?"} to ${b.destinationCity ?? "?"}`,
    carrier: carrier ? carrierLabel(carrier.carrier) : "Carrier not chosen",
    collection: b.readyToShipDate ? isoToDisplay(b.readyToShipDate) : "—",
    totals: `${b.pallets != null ? plural(b.pallets, "pallet") : "? pallets"} · ${b.cartons != null ? plural(b.cartons, "carton") : "? cartons"}`,
    note: b.labelNote ?? null,
  };
  const out: CargoLabel[] = [];
  const pallets = b.pallets ?? 0, cartons = b.cartons ?? 0;
  const pad = (n: number, of: number) => String(n).padStart(String(of).length, "0");
  if (which !== "cartons")
    for (let n = 1; n <= pallets; n++)
      out.push({ ...common, kind: "Pallet", n, of: pallets, code: `${ref}-P${pad(n, pallets)}`, weight: b.grossWeightKg != null ? `${round2(b.grossWeightKg / pallets)} kg (gross ÷ pallets)` : "—" });
  if (which !== "pallets")
    for (let n = 1; n <= cartons; n++)
      out.push({ ...common, kind: "Carton", n, of: cartons, code: `${ref}-C${pad(n, cartons)}`, weight: b.grossWeightKg != null ? `about ${round2(b.grossWeightKg / cartons)} kg (gross ÷ cartons)` : "—" });
  return out;
}
