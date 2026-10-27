// Shared data model. Chat and Excel both normalise into these shapes,
// so the rules engine and carrier engine never care where data came from.

export type DestinationType = "Warehouse" | "Business address";
export type SellerPriority = "Cheapest" | "Fastest" | "Most reliable" | "Balanced";
export type Severity = "Red" | "Amber";
export type RuleStatus = "pass" | "fail" | "review" | "not_evaluable";
export type Readiness = "grounded" | "attention" | "cleared";

/** Pickup or drop-off site. Not in the case template or rulebook; needed before emailing a carrier. */
export interface Address {
  company: string | null;
  street: string | null;
  postcode: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  /** Collection: opening hours / slot. Delivery: reference or slot. */
  notes?: string | null;
}

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

  /** Where the carrier collects the goods (in the origin city). */
  collection?: Address | null;
  /** Where the carrier delivers the goods (in the destination city). */
  delivery?: Address | null;

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

  /** Commercial invoice inputs (after confirmation). Everything else on the invoice comes from the booking. */
  invoice?: InvoiceData | null;
  /** UK export / EU import compliance inputs. */
  compliance?: ComplianceData | null;
  /** Optional handling note printed on cargo labels, e.g. "Keep dry". */
  labelNote?: string | null;
}

export type BuyerType = "B2B" | "B2C";
/** Who moves the goods out of the UK: decides direct vs indirect export for VAT zero-rating (X-04). */
export type DispatchMode = "seller_dispatches" | "customer_collects" | "customer_delivers_uk";

export interface Party {
  name: string | null;
  address: string | null;
  postcode: string | null;
  country: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
}

export interface InvoiceData {
  invoiceNumber: string | null;
  /** ISO yyyy-mm-dd */
  issueDate: string | null;
  /** Proforma invoice, purchase order or sales contract reference, and its date. */
  orderReference: string | null;
  orderDate: string | null;
  paymentMethod: string | null;
  /** Amounts in GBP. */
  discount: number | null;
  freightCharge: number | null;
  insuranceCharge: number | null;
  incoterm: string | null;
  incotermPlace: string | null;
  /** GBP by default; another currency needs a rate (1 GBP = rate) and the date it was fixed. */
  currency: string | null;
  exchangeRate: number | null;
  rateFixedOn: string | null;
  seller: Party | null;
  buyer: Party | null;
  buyerType: BuyerType | null;
  packageType: string | null;
  exporterEori: string | null;
  buyerEori: string | null;
  /** Statement of origin text reviewed by the user; CargoPilot never writes legal wording itself. */
  originStatement: string | null;
  chamberCertification: boolean | null;
  dispatchMode: DispatchMode | null;
}

export type EvidenceType =
  | "NES Goods Departed Message"
  | "Courier airway bill number"
  | "Certificate of posting"
  | "Customs dispatch pack receipt"
  | "Supplementary accounting records";

export interface ExportEvidence {
  type: EvidenceType;
  reference: string;
  /** ISO yyyy-mm-dd the evidence was obtained. */
  obtainedOn: string;
}

export interface ComplianceData {
  /** X-02: declaration reference, or the agent/forwarder handling it. */
  exportDeclarationRef: string | null;
  exportAgent: string | null;
  /** X-03: date the goods are sent and date full payment was received (time of sale is the earlier). */
  goodsSentOn: string | null;
  paymentReceivedOn: string | null;
  evidence: ExportEvidence[];
  /** X-05 */
  classificationCheckedBy: string | null;
  /** M-05 (Netherlands only, informational). */
  article23Licence: boolean | null;
  /** M-06 */
  iossNumber: string | null;
  /** EUR per 1 GBP, entered by the user or taken from a dated official source, and its date. */
  eurRate: number | null;
  eurRateDate: string | null;
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
