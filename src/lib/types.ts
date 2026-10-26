// Shared data model. Chat and Excel both normalise into these shapes,
// so the rules engine and carrier engine never care where data came from.

export type DestinationType = "Warehouse" | "Business address";
export type SellerPriority = "Cheapest" | "Fastest" | "Most reliable" | "Balanced";
export type Severity = "Red" | "Amber";
export type RuleStatus = "pass" | "fail" | "review" | "not_evaluable";
export type Readiness = "grounded" | "attention" | "cleared";

export interface Booking {
  bookingId: string | null;
  sellerName: string | null;
  originCity: string | null;
  originCountry: string | null;
  destinationCity: string | null;
  destinationCountry: string | null;
  destinationType: DestinationType | null;
  /** ISO yyyy-mm-dd; displayed as DD-MM-YYYY */
  readyToShipDate: string | null;
  sellerPriority: SellerPriority | null;
  pallets: number | null;
  cartons: number | null;
  declaredValue: number | null;
  currency: string | null;
  grossWeightKg: number | null;
  deliveryAppointmentBooked: boolean | null;

  /** Carrier id the seller explicitly picked (overrides the recommendation for R-05). */
  chosenCarrier?: string | null;
  /** Seller answers to R-06 screening, keyed by item index. */
  hazardConfirmations?: Record<string, "none" | "contains">;
  /** Issues the seller chose to keep as-is, keyed by issue key, with their reason. */
  keptOriginal?: Record<string, string>;
  /** Fields the seller said they don't know (chat stops asking for them). */
  skippedFields?: string[];
  /** When the seller confirmed the prepared booking. */
  sellerConfirmedAt?: string | null;
  /** Chat only: HS code offered for each item (by item index), so "yes" can accept it next turn. */
  hsSuggested?: Record<string, { code: string; description: string }>;
  /** Chat only: a past ready-to-ship date waiting for the seller to confirm or correct it (not yet saved). */
  pendingReadyDate?: { value: string; suggested: string | null } | null;
  /** "chat" while details are being collected: blank fields we haven't asked about yet are pending, not failures. */
  mode?: "chat" | "upload";
  /** Problems found while reading the uploaded row (bad numbers, unknown values…). */
  importIssues?: DataIssue[];
  /** Source row in the Bookings sheet, when uploaded. */
  sourceRow?: number;
}

export interface Item {
  sku: string | null;
  description: string | null;
  /** Kept as text so leading zeros survive. */
  hsCode: string | null;
  quantity: number | null;
  unitPrice: number | null;
  unitsPerCarton: number | null;
  cartons: number | null;
  unitWeightKg: number | null;
  countryOfOrigin: string | null;
  /** Source row in the Items sheet, when uploaded. */
  sourceRow?: number;
}

export interface Carrier {
  id: string;
  carrier: string;
  service: string;
  originCountry: string;
  destinationCountry: string;
  pricePerPallet: number;
  transitDays: number;
  onTimeRate: number;
  maxWeightPerPalletKg: number;
}

export type Suggestion =
  | { kind: "set"; path: string; value: unknown; label: string }
  | {
      kind: "input";
      path: string;
      label: string;
      inputType: "text" | "number" | "date" | "select";
      options?: string[];
    };

export interface RuleResult {
  /** Stable key, e.g. "R-03:item:1" — used for keep-original acknowledgements. */
  key: string;
  ruleId: string;
  severity: Severity;
  status: RuleStatus;
  title: string;
  /** Plain-English one-liner of what happened. */
  explanation: string;
  /** The calculation, e.g. "1,000 × £5.00 = £5,000.00". */
  calculation?: string;
  observed?: string;
  expected?: string;
  /** Which field(s) the result is about, e.g. "booking.declaredValue". */
  fields: string[];
  itemIndex?: number;
  itemLabel?: string;
  suggestions: Suggestion[];
  /** Present if the seller kept the original value. */
  keptReason?: string;
}

export interface DataIssue {
  level: "error" | "warning";
  message: string;
  field?: string;
  row?: number;
}

export interface CarrierEvaluation {
  carrier: Carrier;
  totalCost: number | null;
  weightPerPallet: number | null;
  eligible: boolean | null;
  ineligibleReason?: string;
  balancedScore?: number;
  scores?: { cost: number; speed: number; reliability: number };
}

export interface CarrierRecommendation {
  priority: SellerPriority | null;
  candidates: CarrierEvaluation[];
  /** Best carrier for the priority ignoring capacity (what the seller would naturally pick). */
  preferred: CarrierEvaluation | null;
  recommended: CarrierEvaluation | null;
  runnerUp: CarrierEvaluation | null;
  /** The carrier R-05 is checked against. */
  selected: CarrierEvaluation | null;
  reason: string;
  tradeOff: string | null;
  unavailableReason: string | null;
}

export interface MissingField {
  path: string;
  label: string;
}

export interface BookingView {
  booking: Booking;
  items: Item[];
  results: RuleResult[];
  dataIssues: DataIssue[];
  carriers: CarrierRecommendation;
  missing: MissingField[];
  readiness: Readiness;
  summary: {
    passed: number;
    red: number;
    amber: number;
    review: number;
    notEvaluable: number;
    headline: string;
  };
  nextSteps: string[];
}
