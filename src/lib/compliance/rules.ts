// The X-, M- and D- rules as deterministic code. Same booking in, same results out.
// Not tax or legal advice: these flag what to check; CargoPilot never files or declares anything.
import { daysBetweenISO, gbp, isoToDisplay, plural, round2, todayISO } from "../format";
import type { BookingView, RuleResult, RuleStatus, Severity, Suggestion } from "../types";
import {
  COMPLIANCE_BY_ID, COMPLIANCE_RULES, DISPATCH_LABELS, EU_COUNTRIES, GB_EORI, IMPORT_VAT, LOW_VALUE, VAGUE_WORDS, ZERO_RATING, type ComplianceRule,
} from "./config";
import { buildInvoice, INVOICE_FIELDS, withinTolerance, type InvoiceModel } from "./invoice";

const blank = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");
const ORIGIN_UK = "United Kingdom";

function make(ruleId: string, status: RuleStatus, explanation: string, extra: Partial<RuleResult> & { severity?: Severity } = {}): RuleResult {
  const rule = COMPLIANCE_BY_ID[ruleId];
  return { key: extra.key ?? ruleId, ruleId, severity: extra.severity ?? rule.severity, status, title: rule.short, explanation, fields: [], suggestions: [], ...extra };
}
const input = (path: string, label: string, inputType: "text" | "number" | "date" | "select" = "text", options?: string[]): Suggestion =>
  ({ kind: "input", path, label, inputType, options });

/** Add whole calendar months to an ISO date (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export interface ZeroRatingStatus {
  timeOfSale: string | null;
  basis: "goods sent" | "payment received" | "planned collection date" | null;
  deadline: string | null;
  daysLeft: number | null;
  evidenceLogged: boolean;
}

export function zeroRating(view: BookingView, today: string): ZeroRatingStatus {
  const b = view.booking, c = b.compliance;
  const sent = c?.goodsSentOn ?? null, paid = c?.paymentReceivedOn ?? null;
  const candidates: [string, ZeroRatingStatus["basis"]][] = [];
  if (sent) candidates.push([sent, "goods sent"]);
  else if (b.readyToShipDate) candidates.push([b.readyToShipDate, "planned collection date"]);
  if (paid) candidates.push([paid, "payment received"]);
  candidates.sort((x, y) => x[0].localeCompare(y[0]));
  const [timeOfSale, basis] = candidates[0] ?? [null, null];
  const deadline = timeOfSale ? addMonthsISO(timeOfSale, ZERO_RATING.evidenceMonths) : null;
  return {
    timeOfSale, basis, deadline,
    daysLeft: deadline ? daysBetweenISO(today, deadline) : null,
    evidenceLogged: (c?.evidence ?? []).some((e) => !blank(e.type) && !blank(e.reference)),
  };
}

export type Payer = "buyer" | "seller" | null;
export const importPayer = (incoterm: string | null): Payer => (!incoterm ? null : incoterm === "DDP" ? "seller" : "buyer");

export interface ComplianceEstimates {
  /** GBP, estimate: goods value + freight + insurance to the border. */
  customsValue: number | null;
  customsValueBasis: string;
  vatRate: number | null;
  vatEstimate: number | null;
  vatSource: string | null;
  vatSourceUrl: string | null;
  lowValue: { applies: boolean; valueEur: number | null; lines: number; dutyEur: number | null; near: boolean } | null;
}

export interface ComplianceView {
  results: RuleResult[];
  rules: { rule: ComplianceRule; status: RuleStatus; worst: Severity | null; results: RuleResult[] }[];
  red: number;
  amber: number;
  invoice: InvoiceModel;
  payer: Payer;
  zero: ZeroRatingStatus;
  estimates: ComplianceEstimates;
  /** Printed on the invoice only when X-03 passes and the export isn't indirect to a UK address. */
  vatLine: string | null;
  /** Why "Approve invoice" is unavailable (empty when it can be approved). */
  approveBlockers: string[];
}

const UK_EXPORT_VAT_LINE = "Zero-rated export: UK VAT not charged.";

export function runCompliance(view: BookingView, now = new Date()): ComplianceView {
  const today = todayISO(now);
  const b = view.booking, c = b.compliance ?? null;
  const inv = buildInvoice(view);
  const d = inv.data;
  const out: RuleResult[] = [];

  // ---------- X-01 Exporter GB EORI ----------
  {
    const eori = (d.exporterEori ?? "").replace(/\s+/g, "").toUpperCase();
    const fix = input("invoice.exporterEori", "Enter the exporter's GB EORI number");
    if (!eori) out.push(make("X-01", "fail", "The exporter's GB EORI number is missing. You need one to move goods out of the UK, even if an agent or forwarder handles the export.", { observed: "blank", expected: "GB EORI number", suggestions: [fix], fields: ["invoice.exporterEori"] }));
    else if (!GB_EORI.pattern.test(eori)) out.push(make("X-01", "fail", `"${eori}" doesn't look like a GB EORI number (GB followed by 12 digits). Check it on GOV.UK's "Check an EORI number" service.`, { severity: "Amber", observed: eori, expected: "GB + 12 digits", suggestions: [fix], fields: ["invoice.exporterEori"] }));
    else out.push(make("X-01", "pass", `Exporter GB EORI ${eori} recorded.`, { observed: eori }));
  }

  // ---------- X-02 Export declaration ----------
  if (blank(c?.exportDeclarationRef) && blank(c?.exportAgent))
    out.push(make("X-02", "fail", "No export declaration recorded. Goods can't leave the UK without one; most exporters use an agent or forwarder. Record the declaration reference or who is handling it. CargoPilot doesn't submit declarations.", {
      observed: "none recorded", expected: "declaration reference or agent", fields: ["compliance.exportDeclarationRef"],
      suggestions: [input("compliance.exportDeclarationRef", "Declaration reference (for example the DUCR)"), input("compliance.exportAgent", "Or: agent or forwarder handling it")],
    }));
  else out.push(make("X-02", "pass", c?.exportDeclarationRef ? `Export declaration reference ${c.exportDeclarationRef} recorded.` : `Export declaration handled by ${c?.exportAgent}.`));

  // ---------- X-03 VAT zero-rating evidence ----------
  const zero = zeroRating(view, today);
  const indirectUk = d.dispatchMode === "customer_delivers_uk";
  {
    const remind = `Keep export evidence for ${ZERO_RATING.keepYears} years and report the sale in Box 6 of your VAT return.`;
    if (zero.evidenceLogged) out.push(make("X-03", "pass", `Export evidence logged. ${remind}`, { observed: `${(c?.evidence ?? []).length} evidence record(s)` }));
    else if (!zero.deadline) out.push(make("X-03", "not_evaluable", "Can't work out the zero-rating deadline yet: add the date the goods are sent or full payment is received.", { fields: ["compliance.goodsSentOn"], suggestions: [input("compliance.goodsSentOn", "Date the goods are sent", "date"), input("compliance.paymentReceivedOn", "Date full payment was received", "date")] }));
    else {
      const left = zero.daysLeft!;
      const when = `Evidence of export is due by ${isoToDisplay(zero.deadline)}, 3 months after the time of sale (${isoToDisplay(zero.timeOfSale)}, ${zero.basis})`;
      if (left < 0) out.push(make("X-03", "fail", `${when}. The deadline has passed with no evidence logged, so you must account for the VAT on your return. ${remind}`, { observed: `${-left} days overdue`, expected: "evidence logged", fields: ["compliance.evidence"] }));
      else if (left < ZERO_RATING.warnDays) out.push(make("X-03", "fail", `${when}: ${plural(left, "day")} left and no evidence logged yet. ${remind}`, { severity: "Amber", observed: `${left} days left`, expected: "evidence logged", fields: ["compliance.evidence"] }));
      else out.push(make("X-03", "not_evaluable", `${when}: ${plural(left, "day")} left. Log the evidence once you have it; the sale isn't marked zero-rated until you do.`, { observed: `${left} days left`, fields: ["compliance.evidence"] }));
    }
  }

  // ---------- X-04 Direct or indirect export ----------
  if (indirectUk) out.push(make("X-04", "fail", "The customer is arranging delivery to a UK address, so this isn't an export you can zero-rate. Charge UK VAT as normal.", { observed: "customer delivers to a UK address", expected: "goods leave the UK", suggestions: [input("invoice.dispatchMode", "Who moves the goods out of the UK?", "select", Object.values(DISPATCH_LABELS))], fields: ["invoice.dispatchMode"] }));
  else if (d.dispatchMode === "customer_collects") out.push(make("X-04", "fail", "The customer collects the goods (indirect export). Confirm how and when the goods leave the UK and what evidence you'll receive.", { severity: "Amber", observed: "customer collects" }));
  else out.push(make("X-04", "pass", "You dispatch the goods yourself (direct export)."));

  // ---------- X-05 Classification checked ----------
  {
    const r01Fails = view.results.filter((r) => r.ruleId === "R-01" && r.status === "fail");
    if (r01Fails.length) out.push(make("X-05", "fail", `${plural(r01Fails.length, "item")} still fail R-01 (HS code). Fix the codes on the Flight Deck first.`, { observed: r01Fails.map((r) => r.itemLabel).join(", ") }));
    else if (blank(c?.classificationCheckedBy)) out.push(make("X-05", "fail", "Check each HS code against the UK Online Trade Tariff and the EU TARIC database, then record who checked it. You're legally responsible for the classification.", { severity: "Amber", observed: "not recorded", expected: "name of the person who checked", suggestions: [input("compliance.classificationCheckedBy", "Classification checked by")], fields: ["compliance.classificationCheckedBy"] }));
    else out.push(make("X-05", "pass", `Classification checked by ${c!.classificationCheckedBy}.`));
  }

  // ---------- X-06 Chamber certification ----------
  if (d.chamberCertification) out.push(make("X-06", "fail", "You've marked that this invoice needs Chamber of Commerce certification. Check the requirement and timing with your local Chamber before dispatch.", { observed: "certification needed" }));
  else out.push(make("X-06", "pass", "No Chamber of Commerce certification marked as needed."));

  // ---------- M-01 Consignee EU EORI ----------
  {
    const has = !blank(d.buyerEori);
    const fix = input("invoice.buyerEori", "Enter the buyer's EU EORI number");
    if (has) out.push(make("M-01", "pass", `Consignee EU EORI ${d.buyerEori} is on the invoice.`, { observed: String(d.buyerEori) }));
    else if (!d.buyerType) out.push(make("M-01", "not_evaluable", "Choose whether the buyer is a business (B2B) or a consumer (B2C).", { suggestions: [input("invoice.buyerType", "Buyer type", "select", ["B2B", "B2C"])], fields: ["invoice.buyerType"] }));
    else out.push(make("M-01", "fail", "The consignee's EU EORI number is missing. A missing EORI is a common cause of border delays. UK EORI numbers aren't recognised in the EU.", { severity: d.buyerType === "B2B" ? "Red" : "Amber", observed: "blank", expected: "EU EORI number", suggestions: [fix], fields: ["invoice.buyerEori"] }));
  }

  // ---------- M-02 Incoterm and place ----------
  const payer = importPayer(d.incoterm);
  {
    const fixes = [input("invoice.incoterm", "Incoterm", "select", ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP"]), input("invoice.incotermPlace", "Named place, for example Berlin")];
    if (blank(d.incoterm) || blank(d.incotermPlace)) out.push(make("M-02", "fail", "Set an Incoterm with a named place (for example DAP Berlin). It decides who pays import duty and VAT.", { observed: [d.incoterm, d.incotermPlace].filter(Boolean).join(" ") || "blank", expected: "Incoterm + named place", suggestions: fixes, fields: ["invoice.incoterm"] }));
    else if (d.incoterm === "DDP") out.push(make("M-02", "fail", `DDP ${d.incotermPlace}: you pay the import duty and import VAT, and may need to register as an economic operator in ${b.destinationCountry ?? "the destination country"}. Confirm registration with your logistics provider before shipping to a new market.`, { severity: "Amber", observed: `DDP ${d.incotermPlace}` }));
    else out.push(make("M-02", "pass", `${d.incoterm} ${d.incotermPlace}: the buyer pays import duty and VAT on arrival.`, { observed: `${d.incoterm} ${d.incotermPlace}` }));
  }

  // ---------- M-03 Preferential origin ----------
  {
    const foreign = [...new Set(inv.lines.map((l) => l.origin).filter((o): o is string => !!o && o !== ORIGIN_UK && !EU_COUNTRIES.includes(o)))];
    if (foreign.length) out.push(make("M-03", "fail", `Origin ${foreign.join(", ")} may not qualify for zero tariff under the UK-EU Trade and Cooperation Agreement; duty may apply.`, { observed: foreign.join(", "), expected: "UK or EU origin" }));
    else if (blank(d.originStatement)) out.push(make("M-03", "fail", "No statement of origin on the invoice. Zero tariff needs goods that meet the rules of origin and a statement of origin; without it, standard duty applies. Paste your approved statement wording (CargoPilot doesn't write it).", { observed: "no statement", expected: "approved statement of origin", suggestions: [input("invoice.originStatement", "Approved statement of origin text")], fields: ["invoice.originStatement"] }));
    else out.push(make("M-03", "pass", "Statement of origin present and every item is of UK or EU origin. Check the goods meet the rules of origin."));
  }

  // ---------- M-04 Import VAT estimate ----------
  const vat = b.destinationCountry ? IMPORT_VAT[b.destinationCountry] : undefined;
  const freightBasis = d.freightCharge != null ? "freight charge on the invoice" : "carrier cost from the rate card";
  const freight = d.freightCharge ?? (view.carriers.selected ?? view.carriers.recommended)?.totalCost ?? null;
  const customsValue = inv.goodsTotal != null ? round2(inv.goodsTotal - inv.discount + (freight ?? 0) + (d.insuranceCharge ?? 0)) : null;
  const vatEstimate = customsValue != null && vat ? round2((customsValue * vat.standard) / 100) : null;
  if (!vat) out.push(make("M-04", "not_evaluable", "No verified import VAT rate for this destination."));
  else if (vatEstimate == null) out.push(make("M-04", "not_evaluable", "Can't estimate import VAT until every item has a quantity and price."));
  else out.push(make("M-04", "pass", `Estimate, not a filing: customs value about ${gbp(customsValue!)} (goods + ${freightBasis}${d.insuranceCharge ? " + insurance" : ""}) × ${vat.standard}% ${b.destinationCountry} import VAT ≈ ${gbp(vatEstimate)}, paid by the ${payer ?? "party named in the Incoterm"} on arrival.`, { calculation: `${gbp(customsValue!)} × ${vat.standard}% = ${gbp(vatEstimate)}`, observed: `${vat.standard}% (${vat.source})` }));

  // ---------- M-05 Article 23 (NL) ----------
  if (b.destinationCountry === "Netherlands")
    out.push(make("M-05", c?.article23Licence == null ? "not_evaluable" : "pass", c?.article23Licence ? "Importer reports an Article 23 licence: import VAT can be declared on the Dutch VAT return instead of paid at customs. Eligibility isn't checked." : c?.article23Licence === false ? "No Article 23 licence: import VAT is paid at customs." : "Information only: does the importer hold an Article 23 VAT deferment licence?", { suggestions: c?.article23Licence == null ? [input("compliance.article23Licence", "Importer has an Article 23 licence", "select", ["Yes", "No"])] : [] }));

  // ---------- M-06 Low-value flat duty ----------
  let lowValue: ComplianceEstimates["lowValue"] = null;
  {
    const date = d.issueDate ?? today;
    const inWindow = date >= LOW_VALUE.from && date < LOW_VALUE.until;
    const lines = new Set(inv.lines.map((l) => (l.hsCode ?? "").replace(/\D/g, "")).filter(Boolean)).size;
    if (d.buyerType !== "B2C") out.push(make("M-06", "pass", "Not a B2C distance sale, so the low-value flat duty doesn't apply."));
    else if (!inWindow) out.push(make("M-06", "pass", `The flat duty only applies from ${isoToDisplay(LOW_VALUE.from)} to ${isoToDisplay(LOW_VALUE.until)}.`));
    else if (!c?.eurRate || !c?.eurRateDate || inv.goodsTotal == null) out.push(make("M-06", "not_evaluable", "Enter a EUR exchange rate and its date (user-entered or from a dated official source) to check the EUR 150 line.", { suggestions: [input("compliance.eurRate", "EUR per 1 GBP", "number"), input("compliance.eurRateDate", "Date of that rate", "date")], fields: ["compliance.eurRate"] }));
    else {
      const valueEur = round2(inv.goodsTotal * c.eurRate);
      const applies = valueEur <= LOW_VALUE.thresholdEur;
      const near = Math.abs(valueEur - LOW_VALUE.thresholdEur) <= LOW_VALUE.thresholdEur * LOW_VALUE.nearMargin;
      const dutyEur = applies ? lines * LOW_VALUE.dutyPerLineEur : null;
      lowValue = { applies, valueEur, lines, dutyEur, near };
      const rateNote = `at ${c.eurRate} EUR/GBP (${isoToDisplay(c.eurRateDate)})`;
      const base = applies
        ? `Estimate: EUR ${valueEur.toFixed(2)} ${rateNote} is within EUR ${LOW_VALUE.thresholdEur}, so a flat EUR ${LOW_VALUE.dutyPerLineEur} customs duty per tariff line applies: ${lines} × EUR ${LOW_VALUE.dutyPerLineEur} = EUR ${dutyEur}, paid by the declarant (seller or importer, including an IOSS holder). Goods under a preferential agreement may be excluded if VAT wasn't collected under IOSS and they're declared correctly.`
        : `EUR ${valueEur.toFixed(2)} ${rateNote} is over EUR ${LOW_VALUE.thresholdEur}, so the flat duty doesn't apply.`;
      const reminder = ` From ${isoToDisplay(LOW_VALUE.productIdentifiersFrom)} product identifiers become mandatory (reminder only).`;
      out.push(make("M-06", near ? "fail" : "pass", near ? `${base} This is within 5% of the EUR ${LOW_VALUE.thresholdEur} line: check the rate and value.${reminder}` : base + (applies ? reminder : ""), { calculation: applies ? `${lines} × EUR ${LOW_VALUE.dutyPerLineEur} = EUR ${dutyEur}` : undefined, suggestions: applies && blank(c.iossNumber) ? [input("compliance.iossNumber", "IOSS number (if you have one)")] : [] }));
    }
  }

  // ---------- D-01 Invoice complete ----------
  {
    const missing = INVOICE_FIELDS.filter((f) => f.missing(inv, view));
    if (!missing.length) out.push(make("D-01", "pass", "Every required invoice field is present."));
    for (const f of missing)
      out.push(make("D-01", "fail", `Invoice is missing: ${f.label}.`, { key: `D-01:${f.path}`, observed: "blank", expected: f.label, fields: [f.path], suggestions: f.path.startsWith("booking.chosenCarrier") ? [] : [input(f.path, f.label, f.inputType, f.options)] }));
  }

  // ---------- D-02 Invoice totals ----------
  if (inv.goodsTotal == null || inv.declaredValue == null) out.push(make("D-02", "not_evaluable", "Can't reconcile yet: every item needs a quantity and price, and the booking a declared value."));
  else if (!withinTolerance(inv.goodsTotal, inv.declaredValue)) out.push(make("D-02", "fail", `Invoice goods total ${gbp(inv.goodsTotal)} doesn't match the declared value ${gbp(inv.declaredValue)} (more than 1% apart). Fix R-02 on the Flight Deck.`, { observed: gbp(inv.goodsTotal), expected: `${gbp(inv.declaredValue)} ±1%`, calculation: inv.lines.map((l) => `${l.quantity} × ${gbp(l.unitPrice ?? 0)}`).join(" + ") + ` = ${gbp(inv.goodsTotal)}` }));
  else out.push(make("D-02", "pass", `Invoice goods total ${gbp(inv.goodsTotal)} matches the declared value ${gbp(inv.declaredValue)} within 1%.`, { calculation: `${gbp(inv.goodsTotal)} vs ${gbp(inv.declaredValue)}` }));

  // ---------- D-03 Parties and addresses ----------
  {
    const gaps: string[] = [];
    for (const [who, p] of [["Seller", d.seller], ["Buyer", d.buyer]] as const) if (blank(p?.name) || blank(p?.address) || (blank(p?.phone) && blank(p?.email))) gaps.push(`${who} name, address or contact`);
    for (const [who, a] of [["Collection", b.collection], ["Delivery", b.delivery]] as const) if (!a || blank(a.company) || blank(a.street) || blank(a.postcode) || blank(a.contactName) || blank(a.phone)) gaps.push(`${who} address or contact`);
    if (gaps.length) out.push(make("D-03", "fail", `Missing: ${gaps.join("; ")}. Labels and the invoice need them.`, { observed: gaps.join("; "), expected: "all four complete", fields: ["addresses"] }));
    else out.push(make("D-03", "pass", "Seller, buyer, collection and delivery details are complete."));
  }

  // ---------- D-04 Item details ----------
  inv.lines.forEach((l, i) => {
    const label = l.sku || `Item ${i + 1}`;
    const problems: string[] = [];
    const desc = (l.description ?? "").trim().toLowerCase();
    const vague = !desc || VAGUE_WORDS.some((w) => desc === w || desc === `${w}s`) || desc.split(/\s+/).every((w) => VAGUE_WORDS.includes(w));
    if (vague) problems.push(desc ? `"${l.description}" is too vague` : "no description");
    if ((l.hsCode ?? "").replace(/\D/g, "").length < 6) problems.push("HS code under 6 digits");
    if (blank(l.origin)) problems.push("no country of origin");
    if (problems.length) out.push(make("D-04", "fail", `${label}: ${problems.join(", ")}. Describe exactly what the goods are (material, type, use).`, { key: `D-04:item:${i}`, itemIndex: i, itemLabel: label, observed: problems.join(", "), suggestions: vague ? [input(`items.${i}.description`, "Specific description")] : [] }));
  });
  if (!out.some((r) => r.ruleId === "D-04")) out.push(make("D-04", "pass", "Every item has a specific description, a 6+ digit HS code and an origin."));

  // ---------- roll-up ----------
  const kept = b.keptOriginal ?? {};
  for (const r of out) if (kept[r.key]) r.keptReason = kept[r.key];
  const enabled = COMPLIANCE_RULES.filter((r) => r.enabled);
  const rules = enabled.map((rule) => {
    const rs = out.filter((r) => r.ruleId === rule.id);
    const fails = rs.filter((r) => r.status === "fail");
    const worst: Severity | null = fails.some((r) => r.severity === "Red") ? "Red" : fails.length ? "Amber" : null;
    const status: RuleStatus = fails.length ? "fail" : rs.some((r) => r.status === "not_evaluable") ? "not_evaluable" : rs.length ? "pass" : "not_evaluable";
    return { rule, status, worst, results: rs };
  });
  const redResults = out.filter((r) => r.status === "fail" && r.severity === "Red");
  const amberOpen = out.filter((r) => r.status === "fail" && r.severity === "Amber" && !r.keptReason);
  const vatLine = !indirectUk && zero.evidenceLogged ? UK_EXPORT_VAT_LINE : null;

  const approveBlockers: string[] = [];
  if (!b.sellerConfirmedAt) approveBlockers.push("Confirm the booking first.");
  const blockingIds = (r: RuleResult) => /^(D-0[1-4]|X-\d+|M-\d+)$/.test(r.ruleId);
  const reds = redResults.filter(blockingIds);
  if (reds.length) approveBlockers.push(`Fix ${plural(reds.length, "critical item")}: ${[...new Set(reds.map((r) => r.ruleId))].join(", ")}.`);
  const ambers = amberOpen.filter(blockingIds);
  if (ambers.length) approveBlockers.push(`Resolve or keep with a note ${plural(ambers.length, "warning")}: ${[...new Set(ambers.map((r) => r.ruleId))].join(", ")}.`);

  return {
    results: out, rules,
    red: rules.filter((r) => r.worst === "Red").length,
    amber: rules.filter((r) => r.worst === "Amber" && r.results.some((x) => x.status === "fail" && !x.keptReason)).length,
    invoice: inv, payer, zero,
    estimates: { customsValue, customsValueBasis: `goods + ${freightBasis}${d.insuranceCharge ? " + insurance" : ""}`, vatRate: vat?.standard ?? null, vatEstimate, vatSource: vat?.source ?? null, vatSourceUrl: vat?.sourceUrl ?? null, lowValue },
    vatLine,
    approveBlockers,
  };
}

/** Plain-language statement of who pays import duty and VAT, driven by the Incoterm. */
export const payerText = (p: Payer, incoterm: string | null) =>
  p === "seller" ? `${incoterm}: you (the seller) pay import duty and import VAT.` : p === "buyer" ? `${incoterm}: the buyer pays import duty and import VAT on arrival.` : "Set an Incoterm to see who pays import duty and VAT.";
