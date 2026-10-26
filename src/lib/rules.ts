// The rulebook (R-01 … R-10) as deterministic code. AI never decides pass/fail.
import { ITEM_ORIGIN_COUNTRIES, R02_TOLERANCE, RULE_BY_ID } from "./constants";
import { carrierLabel } from "./carriers";
import { daysBetweenISO, gbp, isoToDisplay, kg, num, pct, plural, round2 } from "./format";
import { screenDescription } from "./hazard";
import type { Booking, CarrierRecommendation, Item, RuleResult, RuleStatus, Suggestion } from "./types";

const EPS = 1e-9;
const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export function itemLabel(item: Item, i: number): string {
  const name = item.sku || `Item ${i + 1}`;
  return item.description ? `${name} (${item.description})` : name;
}

function make(
  ruleId: string,
  status: RuleStatus,
  explanation: string,
  extra: Partial<RuleResult> & { key?: string } = {},
): RuleResult {
  const rule = RULE_BY_ID[ruleId];
  return {
    key: extra.key ?? ruleId,
    ruleId,
    severity: rule.severity,
    status,
    title: rule.short,
    explanation,
    fields: [],
    suggestions: [],
    ...extra,
  };
}

function missingList(names: string[]) {
  return `Can't check yet. Missing: ${names.join(", ")}.`;
}

/** Collect "Item 2 quantity"-style names for item fields that are blank. */
function missingItemFields(items: Item[], fields: (keyof Item)[], labels: Record<string, string>) {
  const out: string[] = [];
  items.forEach((it, i) => {
    for (const f of fields) if (it[f] == null || it[f] === "") out.push(`${it.sku || `item ${i + 1}`} ${labels[f]}`);
  });
  return out;
}

/** In chat, a blank optional-in-the-sheet field we haven't asked about yet is pending, not a failure. */
const pending = (b: Booking, path: string) => b.mode === "chat" && !(b.skippedFields ?? []).includes(path);

// ---------- R-01 ----------
function r01(b: Booking, items: Item[]): RuleResult[] {
  return items.map((it, i) => {
    const key = `R-01:item:${i}`;
    const base = { key, itemIndex: i, itemLabel: itemLabel(it, i), fields: [`items.${i}.hsCode`] };
    const input: Suggestion = { kind: "input", path: `items.${i}.hsCode`, label: "Enter the HS code (6+ digits)", inputType: "text" };
    const raw = (it.hsCode ?? "").trim();
    if (!raw && pending(b, `items.${i}.hsCode`)) return make("R-01", "not_evaluable", "Waiting for the HS code.", base);
    if (!raw) {
      return make("R-01", "fail", "HS code is missing. Customs uses it to classify the product, so the shipment can be held without it.", {
        ...base, observed: "blank", expected: "at least 6 digits", suggestions: [input],
      });
    }
    const digits = raw.replace(/[\s.\-]/g, "");
    if (!/^\d+$/.test(digits)) {
      return make("R-01", "fail", `HS code "${raw}" contains characters other than digits.`, {
        ...base, observed: raw, expected: "digits only, at least 6", suggestions: [input],
      });
    }
    if (digits.length < 6) {
      const hint = digits.length === 5 ? " If the real code starts with 0, Excel may have dropped the leading zero, so store it as text." : "";
      return make("R-01", "fail", `HS code "${raw}" has only ${digits.length} digits; at least 6 are required.${hint}`, {
        ...base, observed: `${digits.length} digits`, expected: "at least 6 digits", suggestions: [input],
      });
    }
    return make("R-01", "pass", `HS code ${raw} has ${digits.length} digits.`, { ...base, observed: raw });
  });
}

// ---------- R-02 ----------
function r02(b: Booking, items: Item[]): RuleResult {
  const fields = ["booking.declaredValue", ...items.flatMap((_, i) => [`items.${i}.quantity`, `items.${i}.unitPrice`])];
  const missing: string[] = [];
  if (!isNum(b.declaredValue)) missing.push("total declared value");
  if (items.length === 0) missing.push("item rows");
  missing.push(...missingItemFields(items, ["quantity", "unitPrice"], { quantity: "quantity", unitPrice: "unit price" }));
  if (missing.length) return make("R-02", "not_evaluable", missingList(missing), { fields });

  const lines = items.map((it) => `${num(it.quantity!)} × ${gbp(it.unitPrice!)}`);
  const calc = items.reduce((s, it) => s + it.quantity! * it.unitPrice!, 0);
  const declared = b.declaredValue!;
  const calcText = `${lines.join(" + ")} = ${gbp(calc)}`;
  if (calc <= EPS) {
    return make("R-02", "fail", "Items add up to £0, so the declared value can't be verified. Check the unit prices.", {
      fields, calculation: calcText, observed: gbp(declared), expected: "items with a price",
    });
  }
  const diff = Math.abs(declared - calc);
  const ratio = diff / calc;
  const calculation = `${calcText} · declared ${gbp(declared)} · difference ${gbp(diff)} (${pct(ratio, 2)} of calculated)`;
  if (ratio <= R02_TOLERANCE + EPS) {
    return make("R-02", "pass", `Declared ${gbp(declared)} matches the items' value ${gbp(calc)}${diff > EPS ? ` within 1% (${pct(ratio, 2)})` : ""}.`, {
      fields, calculation, observed: gbp(declared), expected: gbp(calc),
    });
  }
  return make("R-02", "fail",
    `Declared value is ${gbp(declared)} but quantity × unit price across items comes to ${gbp(calc)}. That is ${declared < calc ? "under" : "over"}-declared by ${gbp(diff)} (${pct(ratio)}), beyond the 1% allowed. Customs compares this with the invoice.`,
    {
      fields: ["booking.declaredValue"], calculation, observed: gbp(declared), expected: `${gbp(calc)} (±1%)`,
      suggestions: [{ kind: "set", path: "booking.declaredValue", value: round2(calc), label: `Set declared value to ${gbp(calc)}` }],
    });
}

// ---------- R-03 ----------
function r03(items: Item[]): RuleResult[] {
  return items.map((it, i) => {
    const key = `R-03:item:${i}`;
    const base = { key, itemIndex: i, itemLabel: itemLabel(it, i), fields: [`items.${i}.quantity`, `items.${i}.unitsPerCarton`, `items.${i}.cartons`] };
    const missing = missingItemFields([it], ["unitsPerCarton", "cartons", "quantity"], { unitsPerCarton: "units per carton", cartons: "cartons", quantity: "quantity" });
    if (missing.length) return make("R-03", "not_evaluable", missingList(missing), base);
    const expected = it.unitsPerCarton! * it.cartons!;
    const calculation = `${num(it.unitsPerCarton!)} units/carton × ${num(it.cartons!)} cartons = ${num(expected)} units · stated quantity ${num(it.quantity!)}`;
    if (Math.abs(expected - it.quantity!) < EPS) {
      return make("R-03", "pass", `${num(it.unitsPerCarton!)} × ${num(it.cartons!)} = ${num(expected)}, matching the quantity.`, { ...base, calculation });
    }
    const suggestions: Suggestion[] = [];
    if (it.unitsPerCarton! > 0 && Number.isInteger(it.quantity! / it.unitsPerCarton!)) {
      const c = it.quantity! / it.unitsPerCarton!;
      suggestions.push({ kind: "set", path: `items.${i}.cartons`, value: c, label: `Keep quantity, set cartons to ${num(c)}` });
    }
    suggestions.push({ kind: "set", path: `items.${i}.quantity`, value: expected, label: `Keep packing, set quantity to ${num(expected)}` });
    const diff = it.quantity! - expected;
    return make("R-03", "fail",
      `Packing doesn't add up: ${num(it.cartons!)} cartons of ${num(it.unitsPerCarton!)} hold ${num(expected)} units, but the quantity says ${num(it.quantity!)} (${diff > 0 ? `${num(diff)} units unaccounted for` : `${num(-diff)} units too many in cartons`}). The receiving warehouse will report a discrepancy.`,
      { ...base, calculation, observed: num(it.quantity!), expected: num(expected), suggestions });
  });
}

// ---------- R-04 ----------
function r04(b: Booking, items: Item[]): RuleResult {
  const fields = ["booking.cartons", ...items.map((_, i) => `items.${i}.cartons`)];
  const missing: string[] = [];
  if (!isNum(b.cartons)) missing.push("booking total cartons");
  if (items.length === 0) missing.push("item rows");
  missing.push(...missingItemFields(items, ["cartons"], { cartons: "cartons" }));
  if (missing.length) return make("R-04", "not_evaluable", missingList(missing), { fields });
  const sum = items.reduce((s, it) => s + it.cartons!, 0);
  const calculation = `${items.map((it, i) => `${num(it.cartons!)} (${it.sku || `item ${i + 1}`})`).join(" + ")} = ${num(sum)} · booking says ${num(b.cartons!)}`;
  if (Math.abs(sum - b.cartons!) < EPS) {
    return make("R-04", "pass", `Booking total of ${num(b.cartons!)} cartons matches the items.`, { fields, calculation });
  }
  return make("R-04", "fail",
    `The booking says ${num(b.cartons!)} cartons but the items add up to ${num(sum)} (${b.cartons! > sum ? "+" : "−"}${num(Math.abs(b.cartons! - sum))}). The carrier and warehouse will count cartons on arrival.`,
    {
      fields: ["booking.cartons"], calculation, observed: num(b.cartons!), expected: num(sum),
      suggestions: [{ kind: "set", path: "booking.cartons", value: sum, label: `Set booking cartons to ${num(sum)}` }],
    });
}

// ---------- R-05 ----------
function r05(b: Booking, rec: CarrierRecommendation): RuleResult {
  const fields = ["booking.grossWeightKg", "booking.pallets"];
  const missing: string[] = [];
  if (!isNum(b.grossWeightKg)) missing.push("total gross weight");
  if (!isNum(b.pallets)) missing.push("pallets");
  if (missing.length) return make("R-05", "not_evaluable", missingList(missing), { fields });
  if (b.pallets! <= 0) {
    return make("R-05", "fail", "Pallets must be at least 1 to work out weight per pallet.", {
      fields: ["booking.pallets"], observed: num(b.pallets!), expected: "1 or more",
      suggestions: [{ kind: "input", path: "booking.pallets", label: "Enter the number of pallets", inputType: "number" }],
    });
  }
  const wpp = b.grossWeightKg! / b.pallets!;
  const base = `${kg(b.grossWeightKg!)} ÷ ${plural(b.pallets!, "pallet")} = ${kg(wpp)} per pallet`;
  const sel = rec.selected;
  if (!sel) {
    if (rec.candidates.length === 0) {
      return make("R-05", "not_evaluable", `Can't check yet. ${rec.unavailableReason ?? "No carrier selected."}`, { fields, calculation: base });
    }
    const fits = rec.candidates.filter((c) => c.eligible);
    if (fits.length === rec.candidates.length)
      return make("R-05", "pass", `${kg(wpp)} per pallet fits every carrier on this route.`, { fields, calculation: base });
    if (fits.length === 0) {
      const maxLimit = Math.max(...rec.candidates.map((c) => c.carrier.maxWeightPerPalletKg));
      const need = Math.ceil(b.grossWeightKg! / maxLimit);
      return make("R-05", "fail", `${kg(wpp)} per pallet is over every carrier's limit on this route (highest is ${kg(maxLimit)}).`, {
        fields, calculation: base, observed: kg(wpp), expected: `≤ ${kg(maxLimit)}`,
        suggestions: [{ kind: "set", path: "booking.pallets", value: need, label: `Spread over ${need} pallets (${kg(b.grossWeightKg! / need)} each)` }],
      });
    }
    return make("R-05", "review", `${kg(wpp)} per pallet fits some carriers but not others. Set a priority so a carrier can be chosen.`, { fields, calculation: base });
  }
  const limit = sel.carrier.maxWeightPerPalletKg;
  const calculation = `${base} · ${carrierLabel(sel.carrier)} limit ${kg(limit)}`;
  const chosenBy = b.chosenCarrier === sel.carrier.id ? "your chosen carrier" : `the ${(b.sellerPriority ?? "").toLowerCase()} option for your priority`;
  if (wpp <= limit + EPS) {
    return make("R-05", "pass", `${kg(wpp)} per pallet is within ${carrierLabel(sel.carrier)}'s ${kg(limit)} limit (${chosenBy}).`, {
      fields, calculation, observed: kg(wpp), expected: `≤ ${kg(limit)}`,
    });
  }
  const need = Math.ceil(b.grossWeightKg! / limit);
  const suggestions: Suggestion[] = [
    { kind: "set", path: "booking.pallets", value: need, label: `Use ${need} pallets with ${sel.carrier.carrier} (${kg(b.grossWeightKg! / need)} each)` },
  ];
  if (rec.recommended && rec.recommended.carrier.id !== sel.carrier.id) {
    suggestions.push({
      kind: "set", path: "booking.chosenCarrier", value: rec.recommended.carrier.id,
      label: `Switch to ${carrierLabel(rec.recommended.carrier)} (limit ${kg(rec.recommended.carrier.maxWeightPerPalletKg)})`,
    });
  }
  return make("R-05", "fail",
    `${kg(wpp)} per pallet is over the ${kg(limit)} limit of ${carrierLabel(sel.carrier)}, ${chosenBy}. The carrier can refuse overweight pallets at collection.`,
    { fields, calculation, observed: kg(wpp), expected: `≤ ${kg(limit)}`, suggestions });
}

// ---------- R-06 ----------
function r06(b: Booking, items: Item[]): RuleResult[] {
  return items.map((it, i) => {
    const key = `R-06:item:${i}`;
    const base = { key, itemIndex: i, itemLabel: itemLabel(it, i), fields: [`items.${i}.description`] };
    if (!it.description?.trim()) return make("R-06", "not_evaluable", "Can't check yet. The item has no description.", base);
    const answer = b.hazardConfirmations?.[String(i)];
    const s = screenDescription(it.description);
    const removeOrEdit: Suggestion[] = [
      { kind: "set", path: `items.${i}`, value: null, label: "Remove this item from the shipment" },
      { kind: "input", path: `items.${i}.description`, label: "Correct the description", inputType: "text" },
    ];
    if (answer === "contains") {
      return make("R-06", "fail", "Seller confirmed this item contains a lithium battery, aerosol or flammable liquid. These are not allowed on this service.", {
        ...base, suggestions: removeOrEdit,
      });
    }
    if (s.level === "definite") {
      return make("R-06", "fail", `The description mentions "${s.term}", which is a ${s.category}. Lithium batteries, aerosols and flammable liquids can't be shipped.`, {
        ...base, observed: s.term, suggestions: removeOrEdit,
      });
    }
    if (s.level === "possible") {
      if (answer === "none") {
        return make("R-06", "pass", `The description mentions "${s.term}", but the seller confirmed it contains no lithium battery, aerosol or flammable liquid.`, { ...base, observed: s.term });
      }
      return make("R-06", "review", `The description mentions "${s.term}". This ${s.category}, so please confirm before dispatch.`, {
        ...base, observed: s.term,
        suggestions: [
          { kind: "set", path: `hazard.${i}`, value: "none", label: "Confirm: no lithium battery, aerosol or flammable liquid" },
          { kind: "set", path: `hazard.${i}`, value: "contains", label: "It does contain one" },
        ],
      });
    }
    return make("R-06", "pass", "No restricted-goods terms found in the description.", base);
  });
}

// ---------- R-07 ----------
function r07(b: Booking, items: Item[]): RuleResult {
  const fields = ["booking.grossWeightKg", ...items.flatMap((_, i) => [`items.${i}.quantity`, `items.${i}.unitWeightKg`])];
  const missing: string[] = [];
  if (!isNum(b.grossWeightKg)) missing.push("total gross weight");
  if (items.length === 0) missing.push("item rows");
  missing.push(...missingItemFields(items, ["quantity", "unitWeightKg"], { quantity: "quantity", unitWeightKg: "unit weight" }));
  if (missing.length) return make("R-07", "not_evaluable", missingList(missing), { fields });
  const net = items.reduce((s, it) => s + it.quantity! * it.unitWeightKg!, 0);
  const calculation = `${items.map((it) => `${num(it.quantity!)} × ${kg(it.unitWeightKg!)}`).join(" + ")} = ${kg(net)} of goods · gross weight ${kg(b.grossWeightKg!)}`;
  if (b.grossWeightKg! + EPS >= net) {
    return make("R-07", "pass", `Gross weight ${kg(b.grossWeightKg!)} covers the ${kg(net)} of goods${b.grossWeightKg! > net ? ` plus ${kg(b.grossWeightKg! - net)} of packaging` : ""}.`, { fields, calculation });
  }
  return make("R-07", "fail",
    `Gross weight ${kg(b.grossWeightKg!)} is less than the goods alone (${kg(net)}), even before cartons and pallets. It is short by ${kg(net - b.grossWeightKg!)}, so either the gross weight or a unit weight is wrong.`,
    {
      fields: ["booking.grossWeightKg"], calculation, observed: kg(b.grossWeightKg!), expected: `≥ ${kg(net)}`,
      suggestions: [
        { kind: "set", path: "booking.grossWeightKg", value: Math.ceil(net), label: `Raise gross weight to at least ${kg(Math.ceil(net))} (re-weigh incl. packaging)` },
        { kind: "input", path: "booking.grossWeightKg", label: "Enter the re-weighed gross weight (kg)", inputType: "number" },
      ],
    });
}

// ---------- R-08 ----------
function r08(b: Booking): RuleResult {
  const fields = ["booking.destinationType", "booking.deliveryAppointmentBooked"];
  if (!b.destinationType) return make("R-08", "not_evaluable", missingList(["destination type"]), { fields });
  if (b.destinationType !== "Warehouse") return make("R-08", "pass", "Going to a business address, so no warehouse appointment is needed.", { fields });
  if (b.deliveryAppointmentBooked == null) return make("R-08", "not_evaluable", missingList(["whether a delivery appointment is booked"]), { fields });
  if (b.deliveryAppointmentBooked) return make("R-08", "pass", "Warehouse delivery appointment is booked.", { fields });
  return make("R-08", "fail", "This goes to a warehouse but no delivery appointment is booked. Warehouses commonly turn away unbooked deliveries, which means re-delivery fees and delay.", {
    fields: ["booking.deliveryAppointmentBooked"], observed: "No", expected: "Yes",
    suggestions: [{ kind: "set", path: "booking.deliveryAppointmentBooked", value: true, label: "I've booked a delivery slot" }],
  });
}

// ---------- R-09 ----------
function r09(b: Booking, items: Item[]): RuleResult[] {
  return items.map((it, i) => {
    const base = { key: `R-09:item:${i}`, itemIndex: i, itemLabel: itemLabel(it, i), fields: [`items.${i}.countryOfOrigin`] };
    if (it.countryOfOrigin?.trim()) return make("R-09", "pass", `Made in ${it.countryOfOrigin}.`, base);
    if (pending(b, `items.${i}.countryOfOrigin`)) return make("R-09", "not_evaluable", "Waiting for the country of origin.", base);
    return make("R-09", "fail", "Country of origin is missing. Customs needs where the product was made (not where it ships from) to apply the right duty.", {
      ...base, observed: "blank", expected: "a country",
      suggestions: [{ kind: "input", path: `items.${i}.countryOfOrigin`, label: "Choose country of origin", inputType: "select", options: ITEM_ORIGIN_COUNTRIES }],
    });
  });
}

// ---------- R-10 ----------
function r10(b: Booking, today: string): RuleResult {
  const fields = ["booking.readyToShipDate"];
  if (!b.readyToShipDate) return make("R-10", "not_evaluable", missingList(["ready-to-ship date"]), { fields });
  const d = daysBetweenISO(today, b.readyToShipDate);
  const calculation = `Ready ${isoToDisplay(b.readyToShipDate)} vs today ${isoToDisplay(today)} (UK time)`;
  if (d >= 0) {
    return make("R-10", "pass", d === 0 ? "Ready to ship today." : `Ready in ${plural(d, "day")}.`, { fields, calculation });
  }
  return make("R-10", "fail", `Ready-to-ship date ${isoToDisplay(b.readyToShipDate)} is ${plural(-d, "day")} in the past, so a carrier can't collect on it.`, {
    fields, calculation, observed: isoToDisplay(b.readyToShipDate), expected: `${isoToDisplay(today)} or later`,
    suggestions: [{ kind: "input", path: "booking.readyToShipDate", label: "Choose a new ready-to-ship date", inputType: "date" }],
  });
}

export function runRules(b: Booking, items: Item[], rec: CarrierRecommendation, today: string): RuleResult[] {
  const noItems = (id: string) => [make(id, "not_evaluable", "Can't check yet. No items have been added.", { key: id })];
  const perItem = (id: string, fn: () => RuleResult[]) => (items.length ? fn() : noItems(id));
  const results = [
    ...perItem("R-01", () => r01(b, items)),
    r02(b, items),
    ...perItem("R-03", () => r03(items)),
    r04(b, items),
    r05(b, rec),
    ...perItem("R-06", () => r06(b, items)),
    r07(b, items),
    r08(b),
    ...perItem("R-09", () => r09(b, items)),
    r10(b, today),
  ];
  const kept = b.keptOriginal ?? {};
  return results.map((r) => (r.status === "fail" && kept[r.key] ? { ...r, keptReason: kept[r.key] } : r));
}
