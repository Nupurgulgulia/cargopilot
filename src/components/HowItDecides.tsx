import { COMPLIANCE_RULES, COMPLIANCE_VERSION, IMPORT_VAT, NEEDS_VERIFIED_SOURCE, NOT_ADVICE } from "@/lib/compliance/config";
import { CARRIERS, RULEBOOK } from "@/lib/constants";
import { isoToDisplay } from "@/lib/format";

const DECISIONS: [string, string][] = [
  ["Who decides pass or fail?", "Fixed rules in the code, never the AI. The same booking always gets the same result. The AI only reads what you type and writes the replies."],
  ["R-02: what does “within 1%” mean?", "We add up quantity × unit price for every item. The declared value can be at most 1% above or below that total. If the items add up to £0, the check fails and asks for prices."],
  ["R-05: which carrier is checked?", "The carrier that best matches your priority (for example, the cheapest), unless you pick one yourself. If that carrier can't take your pallet weight, the check fails and you can either add pallets or switch to a carrier that fits."],
  ["R-06: how are restricted goods found?", "We scan item descriptions. Clear matches like lithium, aerosol or petrol fail straight away. Unclear ones like batteries, sprays, perfume or electronics ask you to confirm. This is a quick screen, not an official dangerous-goods check."],
  ["R-10: what counts as “today”?", "Today's date in the UK. A ready date of today passes."],
  ["Missing details", "If a check can't run because something is missing, it shows as waiting, never as passed. The booking stays at Needs Attention until the details are added."],
  ["Booking status", "Grounded means at least one critical (Red) problem. Needs Attention means warnings, items to confirm or missing details. Cleared for Dispatch means every check passed. You can keep a warning with a note, but critical problems always block shipping."],
  ["Corrections", "Suggested fixes are only applied when you click them. Every change records the old value, the new value and the time. Your uploaded spreadsheet is never changed."],
  ["Balanced priority", "Each carrier on the route gets a score out of 100 for cost, speed and reliability, compared with the other carriers on that route. Cost counts for 40%, speed for 30% and reliability for 30%. If two carriers tie, the cheaper one wins."],
  ["When carriers tie", "Cheapest: lower cost, then better on-time record, then faster. Fastest: fewer days, then better on-time record, then lower cost. Most reliable: better on-time record, then fewer days, then lower cost."],
  ["Spreadsheet checks", "The template's grey example row is skipped when you add your own rows. We also flag repeated Booking IDs, items with no matching booking, bookings with no items, and numbers or dates we can't read. Nothing unreadable is ever treated as 0."],
  ["What “confirmed” means", "You have approved the booking CargoPilot prepared. CargoPilot does not book the carrier or clear customs for you."],
  ["Tax and customs checks (X, M, D)", "After you confirm a booking, a second fixed rulebook checks the UK export side (X), the import side in Germany, France or the Netherlands (M) and the documents (D). Red blocks invoice approval; Amber needs fixing or keeping with a note. CargoPilot never submits customs declarations or files VAT."],
  ["Invoice approval", "You can approve the invoice once no Red items remain in D-01 to D-04 or any X or M rule, and every Amber item is fixed or kept with a note. Approval stores your name, the time, the invoice number and a fingerprint (SHA-256) of the data and of the PDF. Any later change puts the approval out of date, and the audit trail records it."],
  ["Emailing the invoice", "The carrier email attaches the exact approved PDF, never a regenerated copy. If the invoice isn't approved or is out of date, sending with the attachment is blocked; turn the attachment off to send the email exactly as before."],
  ["Estimates", "Import VAT and low-value duty figures are estimates, not filings. Import VAT uses the destination's standard rate from the European Commission's Your Europe page, with the date it was checked."],
];

export function HowItDecides() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">How CargoPilot decides</h2>
        <p className="mt-1 text-sm text-slate-600">How each check and recommendation is worked out, in plain terms.</p>
      </div>
      <section className="card divide-y divide-slate-100" data-tour="decisions">
        {DECISIONS.map(([q, a]) => (
          <div key={q} className="grid gap-1 px-4 py-3 sm:grid-cols-[240px_1fr]">
            <div className="text-sm font-semibold text-slate-900">{q}</div>
            <div className="text-sm text-slate-700">{a}</div>
          </div>
        ))}
      </section>
      <section className="card overflow-x-auto p-4" data-tour="rulebook">
        <h2 className="text-sm font-semibold text-slate-900">Rulebook (fixed)</h2>
        <table className="mt-2 w-full min-w-[520px] text-sm">
          <tbody>
            {RULEBOOK.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-1.5 pr-3 font-semibold">{r.id}</td>
                <td className="pr-3 text-slate-700">{r.rule}</td>
                <td className={r.severity === "Red" ? "font-semibold text-red-700" : "font-semibold text-amber-700"}>{r.severity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card overflow-x-auto p-4" data-tour="tax-rulebook">
        <h2 className="text-sm font-semibold text-slate-900">Tax and customs rulebook (version {COMPLIANCE_VERSION})</h2>
        <p className="mt-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">{NOT_ADVICE}</p>
        <table className="mt-2 w-full min-w-[720px] text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="text-left"><th className="py-1 pr-3">Rule</th><th className="pr-3">What it checks</th><th className="pr-3">Severity</th><th className="pr-3">Where</th><th>Source · last verified</th></tr>
          </thead>
          <tbody>
            {COMPLIANCE_RULES.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-3 font-semibold">{r.id}<div className="text-xs font-normal text-slate-500">{r.short}</div></td>
                <td className="pr-3 text-slate-700">{r.rule}</td>
                <td className={r.severity === "Red" ? "pr-3 font-semibold text-red-700" : "pr-3 font-semibold text-amber-700"}>{r.severity}</td>
                <td className="pr-3 text-slate-700">{r.jurisdiction}</td>
                <td className="text-xs"><a className="text-teal-700 underline" href={r.sourceUrl} target="_blank" rel="noreferrer">{r.source}</a><div className="text-slate-500">{isoToDisplay(r.lastVerified)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="mt-4 text-sm font-semibold text-slate-900">Import VAT rates used for estimates</h3>
        <ul className="mt-1 text-sm text-slate-700">
          {Object.entries(IMPORT_VAT).map(([country, v]) => (
            <li key={country}>{country}: {v.standard}% standard ({v.reduced.join("% / ")}% reduced) · <a className="text-teal-700 underline" href={v.sourceUrl} target="_blank" rel="noreferrer">{v.source}</a></li>
          ))}
        </ul>
        <h3 className="mt-4 text-sm font-semibold text-slate-900">Needs a verified source (not checked)</h3>
        <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
          {NEEDS_VERIFIED_SOURCE.map((n) => <li key={n.topic}><b>{n.topic}.</b> {n.why}</li>)}
        </ul>
      </section>
      <section className="card overflow-x-auto p-4" data-tour="rate-card">
        <h2 className="text-sm font-semibold text-slate-900">Carrier rate card (fixed)</h2>
        <table className="mt-2 w-full min-w-[620px] text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="text-left"><th className="py-1">Carrier · service</th><th>Route</th><th>£/pallet</th><th>Transit</th><th>On time</th><th>Max kg/pallet</th></tr>
          </thead>
          <tbody>
            {CARRIERS.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="py-1.5">{c.carrier} · {c.service}</td><td>UK → {c.destinationCountry}</td><td>£{c.pricePerPallet}</td>
                <td>{c.transitDays} days</td><td>{c.onTimeRate}%</td><td>{c.maxWeightPerPalletKg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
