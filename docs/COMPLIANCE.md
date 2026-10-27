# Invoice, compliance, labels and invoice email

What was built, where the rules come from, and what is still unsourced or assumed. **Not tax or legal advice.**

- Rulebook and configuration: `src/lib/compliance/config.ts` (version `2026-10-27.1`)
- Rule code: `src/lib/compliance/rules.ts`
- Invoice model: `src/lib/compliance/invoice.ts`
- Labels: `src/lib/labels.ts`
- Email gate: `src/lib/invoiceEmail.ts`
- PDFs: `src/lib/server/pdf/`
- Tests: `tests/compliance.test.ts` and `tests/invoice-email.test.ts`
- Database: `scripts/schema-invoices.sql`

## Sources checked on 27-10-2026

| Used for | Source |
| --- | --- |
| Invoice contents, Chamber certification (D-01 to D-04, X-06) | [business.gov.uk: How to create an export invoice](https://www.business.gov.uk/export-from-uk/learn/categories/funding-financing-and-getting-paid/get-paid/how-create-export-invoice/) |
| X-01 EORI required | [GOV.UK: EORI](https://www.gov.uk/eori) |
| X-01 EORI format | [HMRC design pattern: EORI numbers](https://design.tax.service.gov.uk/hmrc-design-patterns/eori-numbers/) ("GB" + 12 digits) |
| X-02 export declaration | [GOV.UK: Making a full export declaration](https://www.gov.uk/guidance/making-a-full-export-declaration) |
| X-03 / X-04 zero-rating | [HMRC VAT Notice 703](https://www.gov.uk/guidance/vat-on-goods-exported-from-the-uk-notice-703) |
| M-03 origin | [GOV.UK: Import and export goods using preference agreements](https://www.gov.uk/guidance/import-and-export-goods-using-preference-agreements) |
| M-04 VAT rates | [Your Europe: VAT rates](https://europa.eu/youreurope/business/taxation/vat/vat-rules-rates/index_en.htm) (page "last checked 13/07/2026"): Germany 19% (7%), France 20% (5.5%/10%), Netherlands 21% (9%) |
| M-05 Article 23 | [Belastingdienst: Reverse-charge mechanism on import, Article 23](https://www.belastingdienst.nl/wps/wcm/connect/bldcontenten/belastingdienst/business/vat/vat_in_the_netherlands/vat_relating_to_purchase_and_sale_of_goods/import_from_non-_eu_countries_to_the_netherlands/reverse-charge_mechanism_on_import_article_23) |
| Email size limit | [Resend: Attachments](https://resend.com/docs/dashboard/emails/attachments): "Emails can be no larger than 40MB (including attachments after Base64 encoding)." |

## Needs a verified source (disabled or reminder only)

- Germany, France and Netherlands e-invoicing and invoice-format rules.
- Fiscal representation or registration rules for DDP sellers in those countries. M-02 only says "confirm registration with your logistics provider".
- B2C VAT specifics (OSS/IOSS registration, distance-selling thresholds). M-06 only records an IOSS number.
- Product identifiers on low-value consignments from 1 November 2026. This is an informational reminder only; nothing was built, as asked.
- Statement of origin wording. The field stays empty until you supply the approved text.
- **M-06 itself:** the EUR 150 / EUR 3 per tariff line, the 1 July 2026 to 1 July 2028 window and "Regulation (EU) 2026/382" come from the brief. I did not find and check the regulation text. The rule's source says so.

## Assumptions

1. **Approver.** CargoPilot has no login, so the approver types their full name at approval. It's stored as self-declared, with the time, invoice number and the SHA-256 of the data and the PDF.
2. **Compliance doesn't change the booking status.** X/M/D results don't change Grounded / Needs Attention / Cleared for Dispatch. Otherwise every booking would be Grounded before its invoice is filled in, and couldn't be confirmed. They block invoice approval and show on the Flight Deck as "Compliance: N critical".
3. **Confirmation.** Invoice, compliance and label inputs don't undo the booking's confirmation; they put an invoice approval out of date. Any booking, address, weight, value or item change undoes both, as before.
4. **Time of sale (X-03).** This is the earlier of "goods sent" and "full payment received". Until "goods sent" is entered, the planned collection date stands in for it, labelled as such. With more than 30 days left and no evidence, X-03 shows as waiting, not failed.
5. **National Export System.** GOV.UK says NES was withdrawn on 30-09-2024 and declarations now go through CDS. The evidence list still offers "NES Goods Departed Message" because the brief lists it.
6. **EORI format check.** Red if missing. Only Amber if it isn't "GB" + 12 digits (15 is also accepted), because HMRC sources differ slightly on length.
7. **Customs value estimate (M-04).** Goods total − discount + freight + insurance. If no freight charge is entered, the carrier cost from the rate card stands in, and the estimate says so.
8. **Low-value tariff lines (M-06).** These are counted as distinct HS codes across the items.
9. **Vague descriptions (D-04).** These come from a configurable word list: parts, goods, items, products, samples, accessories, spares, gifts, merchandise, misc, various and similar. A description made only of those words fails.
10. **Invoice prefill.** The seller comes from the seller name and the collection address. The buyer comes from the delivery address. The invoice number defaults to `INV-<booking ref>`. The invoice date is never defaulted to today; a moving default would put every approval out of date at midnight.
11. **Invoice currency.** GBP by default. EUR needs a rate (1 GBP = x EUR) and the date it was fixed, both printed on the invoice.
12. **Carton label weight.** Gross weight ÷ cartons, labelled "about". Per-carton weights aren't held. Pallet labels use gross weight ÷ pallets.
13. **"Smaller print version" for oversized PDFs.** The invoice PDF has no images (about 5 KB), so no smaller version exists. If an attachment would ever exceed the limit, sending is blocked with the size and the limit, and the reason suggests sending without it.
14. **Email limits.** A buyer copy counts against the existing per-booking and per-session email limits.
15. **Audit trail.** The existing audit-trail actions are reused. Approval and "approval out of date" are recorded as `invoice.approval` entries.
16. **Hydration fix.** Date and time displays in the new components use the Europe/London time zone, so the server and browser render the same text.
