// Builds everything a screen needs for one booking: rule results, carrier
// recommendation, data-quality issues, readiness status and next steps.
import {
  BOOKING_FIELD_LABELS, CURRENCY, DESTINATIONS, DESTINATION_COUNTRIES, ITEM_FIELD_LABELS, ITEM_ORIGIN_COUNTRIES,
  ORIGIN_CITIES, ORIGIN_COUNTRY, RULEBOOK,
} from "./constants";
import { carrierLabel, recommendCarrier } from "./carriers";
import { addDaysISO, gbp0, isoToDisplay, kg, num, plural, todayISO } from "./format";
import { itemLabel, runRules } from "./rules";
import type { Booking, BookingView, DataIssue, Item, MissingField, Readiness, RuleResult, RuleStatus } from "./types";

const REQUIRED_BOOKING: (keyof Booking)[] = [
  "sellerName", "originCity", "destinationCity", "destinationType", "readyToShipDate", "sellerPriority",
  "pallets", "cartons", "declaredValue", "grossWeightKg", "deliveryAppointmentBooked",
];
const REQUIRED_ITEM: (keyof Item)[] = [
  "description", "quantity", "unitPrice", "unitsPerCarton", "cartons", "unitWeightKg", "hsCode", "countryOfOrigin",
];

export function computeMissing(b: Booking, items: Item[]): MissingField[] {
  const skipped = new Set(b.skippedFields ?? []);
  const out: MissingField[] = [];
  for (const f of REQUIRED_BOOKING) {
    if (f === "deliveryAppointmentBooked" && b.destinationType === "Business address") continue;
    if (b[f] == null || b[f] === "") {
      if (!skipped.has(`booking.${f}`)) out.push({ path: `booking.${f}`, label: BOOKING_FIELD_LABELS[f] });
    }
  }
  if (items.length === 0) out.push({ path: "items", label: "At least one product (what you're shipping)" });
  items.forEach((it, i) => {
    for (const f of REQUIRED_ITEM) {
      if (it[f] == null || it[f] === "") {
        const path = `items.${i}.${f}`;
        if (!skipped.has(path)) out.push({ path, label: `${it.sku || it.description || `Item ${i + 1}`}: ${ITEM_FIELD_LABELS[f]}` });
      }
    }
  });
  return out;
}

/** Data-quality checks that sit outside the ten rules (kept separate so they're never confused with them). */
export function computeDataIssues(b: Booking, items: Item[]): DataIssue[] {
  const out: DataIssue[] = [...(b.importIssues ?? [])];
  if (b.originCountry && b.originCountry !== ORIGIN_COUNTRY)
    out.push({ level: "error", field: "booking.originCountry", message: `Origin country "${b.originCountry}" isn't supported. Every shipment starts in the United Kingdom.` });
  if (b.originCity && !ORIGIN_CITIES.includes(b.originCity))
    out.push({ level: "warning", field: "booking.originCity", message: `Origin city "${b.originCity}" isn't one of ${ORIGIN_CITIES.join(", ")}.` });
  if (b.destinationCountry && !DESTINATION_COUNTRIES.includes(b.destinationCountry))
    out.push({ level: "error", field: "booking.destinationCountry", message: `Destination country "${b.destinationCountry}" isn't served. Choose Germany, France or the Netherlands.` });
  if (b.destinationCity && b.destinationCountry && DESTINATIONS[b.destinationCountry] && !DESTINATIONS[b.destinationCountry].includes(b.destinationCity))
    out.push({ level: "error", field: "booking.destinationCity", message: `${b.destinationCity} isn't in ${b.destinationCountry}. Allowed: ${DESTINATIONS[b.destinationCountry].join(", ")}.` });
  if (b.currency && b.currency !== CURRENCY)
    out.push({ level: "error", field: "booking.currency", message: `Currency "${b.currency}" isn't supported. All values must be in GBP.` });
  const counts: [keyof Booking, string][] = [["pallets", "Pallets"], ["cartons", "Cartons"]];
  for (const [f, l] of counts) {
    const v = b[f] as number | null;
    if (v != null && (v < 0 || !Number.isInteger(v))) out.push({ level: "error", field: `booking.${f}`, message: `${l} should be a whole number of 0 or more (got ${v}).` });
  }
  if (b.pallets === 0) out.push({ level: "error", field: "booking.pallets", message: "Pallets is 0. A shipment needs at least one pallet." });
  for (const [f, l] of [["declaredValue", "Declared value"], ["grossWeightKg", "Gross weight"]] as const) {
    const v = b[f];
    if (v != null && v < 0) out.push({ level: "error", field: `booking.${f}`, message: `${l} can't be negative.` });
  }
  items.forEach((it, i) => {
    const name = it.sku || `Item ${i + 1}`;
    const row = it.sourceRow;
    if (it.unitsPerCarton === 0) out.push({ level: "error", row, field: `items.${i}.unitsPerCarton`, message: `${name}: units per carton is 0.` });
    for (const f of ["quantity", "unitPrice", "unitsPerCarton", "cartons", "unitWeightKg"] as const) {
      const v = it[f];
      if (v != null && v < 0) out.push({ level: "error", row, field: `items.${i}.${f}`, message: `${name}: ${ITEM_FIELD_LABELS[f]} can't be negative.` });
    }
    if (it.countryOfOrigin && !ITEM_ORIGIN_COUNTRIES.includes(it.countryOfOrigin))
      out.push({ level: "warning", row, field: `items.${i}.countryOfOrigin`, message: `${name}: country of origin "${it.countryOfOrigin}" isn't in the allowed list.` });
  });
  return out;
}

const WORST: RuleStatus[] = ["fail", "review", "not_evaluable", "pass"];

/** Rule-level status = the worst status among that rule's results (item rules have one per item). */
export function ruleStatuses(results: RuleResult[]) {
  return RULEBOOK.map((rule) => {
    const rs = results.filter((r) => r.ruleId === rule.id);
    const failing = rs.filter((r) => r.status === "fail");
    const unresolvedFail = failing.some((r) => !r.keptReason || rule.severity === "Red");
    let status: RuleStatus = "pass";
    for (const s of WORST) if (rs.some((r) => r.status === s)) { status = s; break; }
    return { rule, status, results: rs, acknowledged: failing.length > 0 && !unresolvedFail };
  });
}

export function buildView(booking: Booking, items: Item[], now = new Date()): BookingView {
  const today = todayISO(now);
  const carriers = recommendCarrier(booking);
  const results = runRules(booking, items, carriers, today);
  const dataIssues = computeDataIssues(booking, items);
  const missing = computeMissing(booking, items);
  const rules = ruleStatuses(results);

  const red = rules.filter((r) => r.status === "fail" && r.rule.severity === "Red").length;
  const amber = rules.filter((r) => r.status === "fail" && r.rule.severity === "Amber" && !r.acknowledged).length;
  const review = rules.filter((r) => r.status === "review").length;
  const notEvaluable = rules.filter((r) => r.status === "not_evaluable").length;
  const passed = rules.filter((r) => r.status === "pass" || r.acknowledged).length;
  const dataErrors = dataIssues.filter((d) => d.level === "error").length;

  let readiness: Readiness;
  if (red > 0) readiness = "grounded";
  else if (amber > 0 || review > 0 || notEvaluable > 0 || missing.length > 0 || dataErrors > 0) readiness = "attention";
  else readiness = "cleared";

  const bits = [`${passed} of 10 checks passed`];
  if (red) bits.push(plural(red, "critical issue"));
  if (amber) bits.push(plural(amber, "warning"));
  if (review) bits.push(`${review} to confirm`);
  if (notEvaluable) bits.push(`${notEvaluable} waiting for information`);
  bits.push(readiness === "cleared" ? "Ready for dispatch review" : readiness === "grounded" ? "Dispatch blocked" : "Dispatch not ready");

  return {
    booking, items, results, dataIssues, carriers, missing, readiness,
    summary: { passed, red, amber, review, notEvaluable, headline: bits.join(" · ") },
    nextSteps: buildNextSteps(booking, items, results, carriers, readiness, missing.length, dataErrors),
  };
}

function buildNextSteps(
  b: Booking, items: Item[], results: RuleResult[], rec: ReturnType<typeof recommendCarrier>,
  readiness: Readiness, missingCount: number, dataErrors: number,
): string[] {
  const steps: string[] = [];
  const reds = results.filter((r) => r.status === "fail" && r.severity === "Red");
  const ambers = results.filter((r) => r.status === "fail" && r.severity === "Amber" && !r.keptReason);
  const reviews = results.filter((r) => r.status === "review");
  if (missingCount) steps.push(`Provide the ${plural(missingCount, "missing detail")} so every check can run.`);
  if (dataErrors) steps.push(`Correct the ${plural(dataErrors, "data error")} in the booking.`);
  if (reds.length) steps.push(`Fix the ${plural(reds.length, "critical issue")} (${[...new Set(reds.map((r) => r.ruleId))].join(", ")}). The shipment can't leave until these are resolved.`);
  if (reviews.length) steps.push(`Confirm the ${plural(reviews.length, "flagged item")} for restricted goods.`);
  if (ambers.length) steps.push(`Review the ${plural(ambers.length, "warning")} (${[...new Set(ambers.map((r) => r.ruleId))].join(", ")}). Fix them, or add a note saying why they're fine.`);

  const carrier = rec.selected && rec.selected.eligible !== false ? rec.selected : rec.recommended;
  if (b.destinationType === "Warehouse" && !b.deliveryAppointmentBooked)
    steps.push(`Book a delivery slot with the receiving warehouse in ${b.destinationCity ?? "the destination"}.`);
  if (carrier) {
    steps.push(`Confirm ${carrierLabel(carrier.carrier)} with the carrier${carrier.totalCost != null ? ` (estimated ${gbp0(carrier.totalCost)})` : ""}. CargoPilot has prepared the booking but has not contacted the carrier.`);
  }
  const hs = items.filter((it) => it.hsCode).length;
  if (items.length) steps.push(`Prepare the commercial invoice: ${plural(items.length, "line")}, ${hs === items.length ? "HS codes included" : `${items.length - hs} HS code(s) still needed`}, declared value ${b.declaredValue != null ? gbp0(b.declaredValue) : "not set yet"}.`);
  if (b.cartons != null && b.pallets != null)
    steps.push(`Pack and label ${plural(b.cartons, "carton")} on ${plural(b.pallets, "pallet")}${b.grossWeightKg != null ? ` (${kg(b.grossWeightKg)} gross)` : ""}${b.readyToShipDate ? ` ready for collection on ${isoToDisplay(b.readyToShipDate)}` : ""}.`);
  if (carrier && b.readyToShipDate)
    steps.push(`Expected delivery around ${isoToDisplay(addDaysISO(b.readyToShipDate, carrier.carrier.transitDays))} (${plural(carrier.carrier.transitDays, "day")} transit, ${carrier.carrier.onTimeRate}% on time).`);
  if (readiness === "cleared" && !b.sellerConfirmedAt) steps.unshift("All checks pass. Review the summary and confirm the booking.");
  return steps;
}

export { itemLabel, num };
