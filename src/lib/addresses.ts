// Collection and delivery addresses with contacts. Outside the ten rules: optional while checking
// and confirming, but required before a booking request can be emailed to a carrier.
import type { Address, Booking } from "./types";

export const ADDRESS_FIELDS: { key: keyof Address; label: string; required: boolean }[] = [
  { key: "company", label: "Company or site name", required: true },
  { key: "street", label: "Street address", required: true },
  { key: "postcode", label: "Postcode", required: true },
  { key: "contactName", label: "Contact name", required: true },
  { key: "phone", label: "Contact phone", required: true },
  { key: "email", label: "Contact email", required: true },
  { key: "notes", label: "Notes", required: false },
];

export const SIDES = [
  { key: "collection", title: "Collection", notesLabel: "Opening hours or collection slot" },
  { key: "delivery", title: "Delivery", notesLabel: "Delivery reference or slot" },
] as const;

export type Side = (typeof SIDES)[number]["key"];

export const emptyAddress = (): Address => ({ company: null, street: null, postcode: null, contactName: null, phone: null, email: null, notes: null });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s().-]{7,20}$/;

/** Cleans and checks an address. Returns the address or a list of problems. */
export function normaliseAddress(input: unknown): { address: Address } | { errors: string[] } {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out = emptyAddress();
  const errors: string[] = [];
  for (const f of ADDRESS_FIELDS) {
    const raw = src[f.key];
    const v = raw == null ? "" : String(raw).trim().replace(/\s+/g, " ").slice(0, f.key === "notes" ? 300 : 150);
    (out as unknown as Record<string, string | null>)[f.key] = v || null;
  }
  if (out.email && !EMAIL.test(out.email)) errors.push(`"${out.email}" isn't a valid email address.`);
  if (out.phone && !PHONE.test(out.phone)) errors.push(`"${out.phone}" isn't a valid phone number.`);
  if (out.postcode) out.postcode = out.postcode.toUpperCase();
  return errors.length ? { errors } : { address: out };
}

/** Required address and contact details still missing, e.g. ["Collection: Street address", ...]. */
export function addressGaps(b: Booking): string[] {
  const gaps: string[] = [];
  for (const side of SIDES) {
    const a = b[side.key];
    for (const f of ADDRESS_FIELDS) if (f.required && !a?.[f.key]) gaps.push(`${side.title}: ${f.label}`);
  }
  return gaps;
}

/** One-line address, e.g. "Northfield Goods, 12 Mill Lane, M1 2AB Manchester". */
export function addressLine(a: Address | null | undefined, city: string | null): string | null {
  if (!a) return null;
  const place = [a.postcode, city].filter(Boolean).join(" ");
  const parts = [a.company, a.street, place].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function contactLine(a: Address | null | undefined): string | null {
  if (!a) return null;
  const parts = [a.contactName, a.phone, a.email].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
