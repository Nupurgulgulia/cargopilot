import { CARRIERS, RULEBOOK } from "@/lib/constants";

const DECISIONS: [string, string][] = [
  ["Who decides pass or fail?", "Plain code, never the AI. Every rule is a fixed calculation, so the same booking always gets the same result. Gemini only reads what sellers type and words the replies."],
  ["R-02 — what does “within 1%” mean?", "The gap between the declared value and Σ(quantity × unit price) divided by that calculated value must be 1% or less. If the items add up to £0, the check fails and asks for prices."],
  ["R-05 — which carrier is “chosen”?", "The carrier your priority points to (e.g. the cheapest), unless you pick one yourself. If that carrier can't take your pallet weight, R-05 fails and we offer two fixes: add pallets, or switch to the best carrier that fits."],
  ["R-06 — how are restricted goods found?", "Descriptions are screened for clear terms (lithium, aerosol, petrol…) which fail as Red. Unclear ones (batteries, sprays, perfume, electronics) are marked “Please confirm” and you answer. This is a screen, not a certified dangerous-goods check."],
  ["R-10 — what is “today”?", "The UK calendar date (Europe/London). A ready date of today passes."],
  ["Missing data", "A check that can't run is shown as “Waiting for data” — never as passed. Missing details keep the booking at Needs Attention."],
  ["Readiness", "Grounded = any Red failure. Needs Attention = Amber warnings, items to confirm, or missing details. Cleared for Dispatch = no rulebook issues. You can keep an Amber value with a reason; Red issues always block dispatch."],
  ["Corrections", "Suggested fixes are never applied without your click. Every change keeps the old value, new value and time. Uploaded workbooks are never modified."],
  ["Balanced priority", "Each carrier on the route is scored 0–100 on cost, speed and reliability (min–max across that route), then weighted 40% cost, 30% speed, 30% reliability. Ties are broken by cost."],
  ["Tie-breaks", "Cheapest: cost → on-time → speed. Fastest: days → on-time → cost. Most reliable: on-time → days → cost."],
  ["Workbook quirks", "The template's grey example row is skipped when real rows follow. Duplicate Booking IDs, item rows with no matching booking, and bookings with no items are reported. Unreadable numbers or dates are flagged, never turned into 0."],
  ["What “confirmed” means", "Confirmation means you've approved the prepared booking. CargoPilot has not booked the carrier or cleared customs."],
];

export function HowItDecides() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">How CargoPilot decides</h2>
        <p className="mt-1 text-sm text-slate-600">Every decision is shown so you can check it. These are the choices where the case left room for interpretation.</p>
      </div>
      <section className="card divide-y divide-slate-100">
        {DECISIONS.map(([q, a]) => (
          <div key={q} className="grid gap-1 px-4 py-3 sm:grid-cols-[240px_1fr]">
            <div className="text-sm font-semibold text-slate-900">{q}</div>
            <div className="text-sm text-slate-700">{a}</div>
          </div>
        ))}
      </section>
      <section className="card overflow-x-auto p-4">
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
      <section className="card overflow-x-auto p-4">
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
