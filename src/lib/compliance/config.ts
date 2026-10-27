// Versioned compliance rulebook (X- UK export, M- destination import, D- documents).
// Changing a rule, rate or threshold is a data change here: every entry carries its source,
// jurisdiction and the date it was last verified. No AI decides pass or fail.
// Not tax or legal advice: rules flag what to check; they don't file or declare anything.

import type { Severity } from "../types";

export const COMPLIANCE_VERSION = "2026-10-27.1";
export const NOT_ADVICE = "Not tax or legal advice. CargoPilot flags what to check; confirm with HMRC, your customs agent or an adviser.";

export type Jurisdiction = "UK" | "EU" | "Germany" | "France" | "Netherlands" | "UK to EU";

export interface ComplianceRule {
  id: string;
  short: string;
  /** Plain-language statement shown on "How it decides". */
  rule: string;
  /** Severity when the rule fails. Some rules also raise a softer level in specific cases (noted in the text). */
  severity: Severity;
  jurisdiction: Jurisdiction;
  source: string;
  sourceUrl: string;
  /** ISO date the source was last checked for this rule. */
  lastVerified: string;
  enabled: boolean;
  /** Why the rule is switched off, when it is. */
  disabledReason?: string;
}

const GOV_EXPORT_INVOICE = "https://www.business.gov.uk/export-from-uk/learn/categories/funding-financing-and-getting-paid/get-paid/how-create-export-invoice/";
const GOV_VAT_EXPORTS = "https://www.gov.uk/guidance/vat-on-goods-exported-from-the-uk-notice-703";
const GOV_EORI = "https://www.gov.uk/eori";
const HMRC_EORI_FORMAT = "https://design.tax.service.gov.uk/hmrc-design-patterns/eori-numbers/";
const GOV_EXPORT_DECL = "https://www.gov.uk/guidance/making-a-full-export-declaration";
const GOV_TARIFF = "https://www.trade-tariff.service.gov.uk/";
const EU_TARIC = "https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp";
const EU_TCA_ORIGIN = "https://www.gov.uk/guidance/import-and-export-goods-using-preference-agreements";
const EU_VAT_RATES = "https://europa.eu/youreurope/business/taxation/vat/vat-rules-rates/index_en.htm";
const NL_ART23 = "https://www.belastingdienst.nl/wps/wcm/connect/bldcontenten/belastingdienst/business/vat/vat_in_the_netherlands/vat_relating_to_purchase_and_sale_of_goods/import_from_non-_eu_countries_to_the_netherlands/reverse-charge_mechanism_on_import_article_23";
const EU_LOW_VALUE = "https://eur-lex.europa.eu/";
const INCOTERMS = "https://iccwbo.org/business-solutions/incoterms-rules/";

export const COMPLIANCE_RULES: ComplianceRule[] = [
  // ---------- UK export side ----------
  { id: "X-01", short: "Exporter GB EORI", rule: "The exporter has a GB EORI number (needed to move goods out of the UK, even through an agent or forwarder). Red if missing; Amber if it doesn't look like GB followed by 12 digits.", severity: "Red", jurisdiction: "UK", source: "GOV.UK: Get an EORI number; HMRC design pattern: EORI numbers", sourceUrl: GOV_EORI, lastVerified: "2026-10-27", enabled: true },
  { id: "X-02", short: "Export declaration", rule: "An export declaration reference, or the agent or forwarder handling it, is recorded. Goods can't leave the UK without a declaration. CargoPilot doesn't submit it.", severity: "Amber", jurisdiction: "UK", source: "GOV.UK: Making a full export declaration", sourceUrl: GOV_EXPORT_DECL, lastVerified: "2026-10-27", enabled: true },
  { id: "X-03", short: "VAT zero-rating evidence", rule: "A UK sale is zero-rated only if the goods are exported and evidence of export is obtained within 3 months of the time of sale (the earlier of the day the goods are sent or full payment is received). Amber with under 30 days left, Red once the deadline passes with no evidence logged.", severity: "Red", jurisdiction: "UK", source: "HMRC VAT Notice 703: VAT on goods exported from the UK", sourceUrl: GOV_VAT_EXPORTS, lastVerified: "2026-10-27", enabled: true },
  { id: "X-04", short: "Direct or indirect export", rule: "If the customer collects, confirm how and when the goods leave and what evidence you'll receive (Amber). If the customer arranges delivery to a UK address, don't zero-rate (Red).", severity: "Red", jurisdiction: "UK", source: "HMRC VAT Notice 703: VAT on goods exported from the UK", sourceUrl: GOV_VAT_EXPORTS, lastVerified: "2026-10-27", enabled: true },
  { id: "X-05", short: "Classification checked", rule: "Every item has an HS code (R-01) and someone has checked the classification against the UK Online Trade Tariff and the EU TARIC database. Red if an HS code fails R-01; Amber until \"classification checked by\" is filled in.", severity: "Red", jurisdiction: "UK to EU", source: "UK Online Trade Tariff; EU TARIC", sourceUrl: GOV_TARIFF, lastVerified: "2026-10-27", enabled: true },
  { id: "X-06", short: "Chamber certification", rule: "If you've marked that the invoice needs Chamber of Commerce certification, check the requirement with your local Chamber.", severity: "Amber", jurisdiction: "UK", source: "UK Government: How to create an export invoice", sourceUrl: GOV_EXPORT_INVOICE, lastVerified: "2026-10-27", enabled: true },

  // ---------- Destination import side ----------
  { id: "M-01", short: "Consignee EU EORI", rule: "The consignee's EU EORI number is on the invoice. Red for business buyers (B2B); Amber for consumers (B2C). UK and EU EORI numbers aren't recognised across the border.", severity: "Red", jurisdiction: "EU", source: "UK Government: How to create an export invoice", sourceUrl: GOV_EXPORT_INVOICE, lastVerified: "2026-10-27", enabled: true },
  { id: "M-02", short: "Incoterm and place", rule: "An Incoterm with a named place is set (for example DAP Berlin). It decides who pays import duty and VAT. DDP: you pay, and may need to register as an economic operator in the destination country (Amber: confirm with your logistics provider).", severity: "Red", jurisdiction: "UK to EU", source: "ICC Incoterms rules", sourceUrl: INCOTERMS, lastVerified: "2026-10-27", enabled: true },
  { id: "M-03", short: "Preferential origin", rule: "Zero tariff under the UK-EU Trade and Cooperation Agreement needs goods that meet the rules of origin and a statement of origin on the invoice. Amber if an item's origin is outside the UK and EU, or the statement is missing.", severity: "Amber", jurisdiction: "UK to EU", source: "GOV.UK: Import and export goods using preference agreements", sourceUrl: EU_TCA_ORIGIN, lastVerified: "2026-10-27", enabled: true },
  { id: "M-04", short: "Import VAT estimate", rule: "Import VAT is charged in the destination country at its standard rate on arrival. CargoPilot shows an estimate only (customs value × rate), not a filing.", severity: "Amber", jurisdiction: "EU", source: "Your Europe: VAT rates (European Commission)", sourceUrl: EU_VAT_RATES, lastVerified: "2026-10-27", enabled: true },
  { id: "M-05", short: "Article 23 licence (NL)", rule: "Netherlands only, information: if the importer holds an Article 23 VAT deferment licence, import VAT can be declared on the Dutch VAT return instead of paid at customs. CargoPilot doesn't assume eligibility.", severity: "Amber", jurisdiction: "Netherlands", source: "Belastingdienst: Reverse-charge mechanism on import, Article 23", sourceUrl: NL_ART23, lastVerified: "2026-10-27", enabled: true },
  { id: "M-06", short: "Low-value flat duty", rule: "From 1 July 2026 to 1 July 2028, EU distance-sale consignments up to EUR 150 carry a flat EUR 3 customs duty per item (counted by tariff classification), paid by the declarant. Shown for B2C consignments under EUR 150 as an estimate; Amber within 5% of the EUR 150 line.", severity: "Amber", jurisdiction: "EU", source: "Regulation (EU) 2026/382, as summarised in the CargoPilot brief (not independently verified)", sourceUrl: EU_LOW_VALUE, lastVerified: "2026-10-27", enabled: true },

  // ---------- Documents ----------
  { id: "D-01", short: "Invoice complete", rule: "Every field the export invoice must carry is present: seller and buyer details, invoice number and date, order reference, price and payment terms, weights and packages, HS codes and descriptions, Incoterm, origin, transport and route, and value.", severity: "Red", jurisdiction: "UK", source: "UK Government: How to create an export invoice", sourceUrl: GOV_EXPORT_INVOICE, lastVerified: "2026-10-27", enabled: true },
  { id: "D-02", short: "Invoice totals", rule: "The invoice goods total equals the item lines and the declared value used by R-02, within 1%.", severity: "Red", jurisdiction: "UK", source: "CargoPilot rulebook R-02 (1% tolerance)", sourceUrl: GOV_EXPORT_INVOICE, lastVerified: "2026-10-27", enabled: true },
  { id: "D-03", short: "Parties and addresses", rule: "Seller, buyer, collection and delivery addresses and contacts are present (labels and the invoice need them).", severity: "Red", jurisdiction: "UK", source: "UK Government: How to create an export invoice", sourceUrl: GOV_EXPORT_INVOICE, lastVerified: "2026-10-27", enabled: true },
  { id: "D-04", short: "Item details", rule: "Item descriptions are specific (not vague words such as \"parts\" or \"goods\"), HS codes have at least 6 digits and every item has a country of origin.", severity: "Red", jurisdiction: "UK to EU", source: "UK Government: How to create an export invoice", sourceUrl: GOV_EXPORT_INVOICE, lastVerified: "2026-10-27", enabled: true },
];

export const COMPLIANCE_BY_ID = Object.fromEntries(COMPLIANCE_RULES.map((r) => [r.id, r]));

/** Checks the brief asked for that have no verified source yet: listed on "How it decides", never run. */
export const NEEDS_VERIFIED_SOURCE: { topic: string; why: string }[] = [
  { topic: "Germany, France and Netherlands e-invoicing and invoice-format rules", why: "No official source checked yet." },
  { topic: "Fiscal representation or registration rules for DDP sellers in Germany, France and the Netherlands", why: "No official source checked yet; M-02 only reminds you to confirm with your logistics provider." },
  { topic: "B2C VAT specifics (OSS/IOSS registration, distance-selling thresholds)", why: "No official source checked yet; M-06 only records an IOSS number." },
  { topic: "Product identifiers on low-value consignments from 1 November 2026", why: "Informational reminder only; nothing is built until the owner confirms the requirement." },
  { topic: "Statement of origin wording", why: "Approved text not supplied yet; the invoice field stays empty until it is." },
];

/** Standard import VAT rates by destination (percent), with source and date. Used only for estimates (M-04). */
export const IMPORT_VAT: Record<string, { standard: number; reduced: number[]; source: string; sourceUrl: string; checked: string }> = {
  Germany: { standard: 19, reduced: [7], source: "Your Europe: VAT rates (European Commission), page last checked 13/07/2026", sourceUrl: EU_VAT_RATES, checked: "2026-07-13" },
  France: { standard: 20, reduced: [5.5, 10], source: "Your Europe: VAT rates (European Commission), page last checked 13/07/2026", sourceUrl: EU_VAT_RATES, checked: "2026-07-13" },
  Netherlands: { standard: 21, reduced: [9], source: "Your Europe: VAT rates (European Commission), page last checked 13/07/2026", sourceUrl: EU_VAT_RATES, checked: "2026-07-13" },
};

export const LOW_VALUE = {
  from: "2026-07-01",
  until: "2028-07-01",
  thresholdEur: 150,
  dutyPerLineEur: 3,
  nearMargin: 0.05,
  productIdentifiersFrom: "2026-11-01",
};

/** VAT zero-rating evidence (X-03). */
export const ZERO_RATING = { evidenceMonths: 3, warnDays: 30, keepYears: 6 };

/** Words too vague to describe goods on their own (D-04). Matched as whole words. */
export const VAGUE_WORDS = ["parts", "part", "goods", "items", "item", "products", "product", "stuff", "samples", "sample", "accessories", "misc", "miscellaneous", "various", "general merchandise", "merchandise", "spares", "spare", "gifts", "gift"];

export const EU_COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece",
  "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland", "Portugal", "Romania",
  "Slovakia", "Slovenia", "Spain", "Sweden",
];

/** Who moves the goods out of the UK (X-04), as shown in the form. */
export const DISPATCH_LABELS = {
  seller_dispatches: "I dispatch the goods (direct export)",
  customer_collects: "The customer collects the goods (indirect export)",
  customer_delivers_uk: "The customer arranges delivery to a UK address",
} as const;

export const INCOTERMS_2020 = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP"];
export const INVOICE_CURRENCIES = ["GBP", "EUR"];
export const PACKAGE_TYPES = ["Pallet", "Carton", "Crate", "Case", "Drum", "Bag"];
export const EVIDENCE_TYPES = [
  "NES Goods Departed Message",
  "Courier airway bill number",
  "Certificate of posting",
  "Customs dispatch pack receipt",
  "Supplementary accounting records",
] as const;

/** Email provider limit for the whole message, including attachments after Base64 encoding. */
export const EMAIL_LIMIT = {
  bytes: 40 * 1024 * 1024,
  /** Base64 grows a file by about 4/3. */
  base64Factor: 4 / 3,
  source: "Resend documentation: \"Emails can be no larger than 40MB (including attachments after Base64 encoding).\"",
  sourceUrl: "https://resend.com/docs/dashboard/emails/attachments",
  checked: "2026-10-27",
};

/** GB EORI: GB followed by 12 digits (HMRC design pattern; one HMRC guide allows up to 15). */
export const GB_EORI = { pattern: /^GB\d{12}(\d{3})?$/, sourceUrl: HMRC_EORI_FORMAT };

export const SOURCES = { GOV_EXPORT_INVOICE, GOV_VAT_EXPORTS, GOV_TARIFF, EU_TARIC };
