import { BALANCED_WEIGHTS, CARRIERS, ORIGIN_COUNTRY } from "./constants";
import { gbp0, kg, num, plural } from "./format";
import type { Booking, Carrier, CarrierEvaluation, CarrierRecommendation, SellerPriority } from "./types";

const label = (c: Carrier) => `${c.carrier} · ${c.service}`;

/** Min–max normalise to 0–100 where higher is better. All-equal values score 100. */
function normalise(values: number[], higherIsBetter: boolean): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 100);
  return values.map((v) => ((higherIsBetter ? v - min : max - v) / (max - min)) * 100);
}

/** Attach Balanced scores computed within the given pool (so scores compare like with like). */
function scorePool(pool: CarrierEvaluation[]): CarrierEvaluation[] {
  if (pool.length === 0) return pool;
  // Price per pallet is proportional to total cost for a fixed pallet count, so it ranks identically.
  const cost = normalise(pool.map((e) => e.carrier.pricePerPallet), false);
  const speed = normalise(pool.map((e) => e.carrier.transitDays), false);
  const rel = normalise(pool.map((e) => e.carrier.onTimeRate), true);
  return pool.map((e, i) => ({
    ...e,
    scores: { cost: cost[i], speed: speed[i], reliability: rel[i] },
    balancedScore:
      BALANCED_WEIGHTS.cost * cost[i] + BALANCED_WEIGHTS.speed * speed[i] + BALANCED_WEIGHTS.reliability * rel[i],
  }));
}

/** Sort by the seller's priority, with explicit tie-breakers so results are reproducible. */
export function rankByPriority(pool: CarrierEvaluation[], priority: SellerPriority): CarrierEvaluation[] {
  const scored = scorePool(pool);
  const byCost = (a: CarrierEvaluation, b: CarrierEvaluation) => a.carrier.pricePerPallet - b.carrier.pricePerPallet;
  const bySpeed = (a: CarrierEvaluation, b: CarrierEvaluation) => a.carrier.transitDays - b.carrier.transitDays;
  const byRel = (a: CarrierEvaluation, b: CarrierEvaluation) => b.carrier.onTimeRate - a.carrier.onTimeRate;
  const byScore = (a: CarrierEvaluation, b: CarrierEvaluation) => (b.balancedScore ?? 0) - (a.balancedScore ?? 0);
  const chain =
    (...fns: ((a: CarrierEvaluation, b: CarrierEvaluation) => number)[]) =>
    (a: CarrierEvaluation, b: CarrierEvaluation) => {
      for (const f of fns) {
        const r = f(a, b);
        if (Math.abs(r) > 1e-9) return r;
      }
      return a.carrier.id.localeCompare(b.carrier.id);
    };
  const order = {
    Cheapest: chain(byCost, byRel, bySpeed),
    Fastest: chain(bySpeed, byRel, byCost),
    "Most reliable": chain(byRel, bySpeed, byCost),
    Balanced: chain(byScore, byCost),
  }[priority];
  return [...scored].sort(order);
}

export function evaluateCarrier(carrier: Carrier, booking: Booking): CarrierEvaluation {
  const pallets = booking.pallets;
  const okPallets = pallets != null && pallets > 0;
  const totalCost = okPallets ? pallets * carrier.pricePerPallet : null;
  const weightPerPallet = okPallets && booking.grossWeightKg != null ? booking.grossWeightKg / pallets : null;
  const eligible = weightPerPallet == null ? null : weightPerPallet <= carrier.maxWeightPerPalletKg + 1e-9;
  return {
    carrier,
    totalCost,
    weightPerPallet,
    eligible,
    ineligibleReason:
      eligible === false
        ? `${kg(weightPerPallet!)} per pallet is over its ${kg(carrier.maxWeightPerPalletKg)} limit`
        : undefined,
  };
}

const priorityPhrase: Record<SellerPriority, string> = {
  Cheapest: "cheapest",
  Fastest: "fastest",
  "Most reliable": "most reliable",
  Balanced: "best-balanced",
};

function whyBest(e: CarrierEvaluation, priority: SellerPriority, pallets: number | null): string {
  const c = e.carrier;
  switch (priority) {
    case "Cheapest":
      return e.totalCost != null
        ? `${gbp0(e.totalCost)} for ${plural(pallets!, "pallet")} (${gbp0(c.pricePerPallet)} per pallet), the lowest price of the carriers that can take your load.`
        : `${gbp0(c.pricePerPallet)} per pallet, the lowest price on this route.`;
    case "Fastest":
      return `${plural(c.transitDays, "day")} in transit, the quickest of the carriers that can take your load.`;
    case "Most reliable":
      return `${c.onTimeRate}% of its shipments arrive on the promised day, the best record of the carriers that can take your load.`;
    case "Balanced":
      return `the highest overall score (${num(e.balancedScore ?? 0, 0)}/100) when cost counts 40%, speed 30% and reliability 30%.`;
  }
}

function compare(a: CarrierEvaluation, b: CarrierEvaluation): string {
  const parts: string[] = [];
  if (a.totalCost != null && b.totalCost != null && a.totalCost !== b.totalCost) {
    const d = b.totalCost - a.totalCost;
    parts.push(d > 0 ? `${gbp0(d)} more` : `${gbp0(-d)} cheaper`);
  } else if (a.carrier.pricePerPallet !== b.carrier.pricePerPallet) {
    const d = b.carrier.pricePerPallet - a.carrier.pricePerPallet;
    parts.push(d > 0 ? `${gbp0(d)}/pallet more` : `${gbp0(-d)}/pallet cheaper`);
  }
  const dd = b.carrier.transitDays - a.carrier.transitDays;
  if (dd !== 0) parts.push(dd > 0 ? `${plural(dd, "day")} slower` : `${plural(-dd, "day")} faster`);
  const dr = b.carrier.onTimeRate - a.carrier.onTimeRate;
  if (dr !== 0) parts.push(dr > 0 ? `${dr} pts more reliable` : `${-dr} pts less reliable`);
  return parts.length ? parts.join(", ") : "identical on cost, speed and reliability";
}

export function recommendCarrier(booking: Booking): CarrierRecommendation {
  const priority = booking.sellerPriority;
  const empty = (reason: string): CarrierRecommendation => ({
    priority,
    candidates: [],
    preferred: null,
    recommended: null,
    runnerUp: null,
    selected: null,
    reason: "",
    tradeOff: null,
    unavailableReason: reason,
  });

  if (!booking.destinationCountry) return empty("Destination country is needed to find carriers for the route.");
  if (booking.originCountry && booking.originCountry !== ORIGIN_COUNTRY)
    return empty(`No carrier in the rate card collects from ${booking.originCountry}.`);

  const route = CARRIERS.filter((c) => c.destinationCountry === booking.destinationCountry);
  if (route.length === 0) return empty(`No carrier in the rate card serves United Kingdom → ${booking.destinationCountry}.`);

  const evaluated = route.map((c) => evaluateCarrier(c, booking));
  const chosen = booking.chosenCarrier ? evaluated.find((e) => e.carrier.id === booking.chosenCarrier) ?? null : null;

  if (!priority) {
    const base = { ...empty(""), candidates: scorePool(evaluated), selected: chosen };
    return { ...base, unavailableReason: "Seller priority is needed to rank carriers." };
  }

  const all = rankByPriority(evaluated, priority);
  const eligiblePool = all.filter((e) => e.eligible !== false);
  const ranked = rankByPriority(eligiblePool, priority);
  const preferred = all[0];
  const recommended = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;

  // Show every candidate with scores from the full route so the table is comparable.
  const candidates = all;

  if (!recommended) {
    const maxLimit = Math.max(...route.map((c) => c.maxWeightPerPalletKg));
    return {
      priority,
      candidates,
      preferred,
      recommended: null,
      runnerUp: null,
      selected: chosen ?? preferred,
      reason: "",
      tradeOff: null,
      unavailableReason: `No carrier on this route accepts ${kg(preferred.weightPerPallet!)} per pallet (the highest limit is ${kg(maxLimit)}). Spread the load over more pallets.`,
    };
  }

  let reason = `${label(recommended.carrier)} is the ${priorityPhrase[priority]} choice: ${whyBest(recommended, priority, booking.pallets)}`;
  if (preferred.carrier.id !== recommended.carrier.id && preferred.eligible === false) {
    reason =
      `${label(preferred.carrier)} would be the ${priorityPhrase[priority]} option, but ${preferred.ineligibleReason}. ` +
      `Among carriers that can take the load, ${label(recommended.carrier)} is ${priorityPhrase[priority]}: ${whyBest(recommended, priority, booking.pallets)}`;
  }
  if (recommended.eligible === null) {
    reason += " Pallet weight can't be checked yet (needs pallets and gross weight).";
  }

  const tradeOff = runnerUp
    ? `Runner-up: ${label(runnerUp.carrier)}, which is ${compare(recommended, runnerUp)}.`
    : "No runner-up: this is the only carrier on the route that can take the load.";

  return {
    priority,
    candidates,
    preferred,
    recommended,
    runnerUp,
    selected: chosen ?? preferred,
    reason,
    tradeOff,
    unavailableReason: null,
  };
}

export const carrierLabel = label;
