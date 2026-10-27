"use client";
import { useState } from "react";
import { gbp0, isoToDisplay, kg, num } from "@/lib/format";
import type { BookingView } from "@/lib/types";
import type { RunAction } from "./FlightDeck";
import { HsSuggest } from "./HsSuggest";

// Live structured view of what the chat has collected so far, as rounded "bubbles".
export function BookingSummary({ view, highlight, run }: { view: BookingView; highlight: Set<string>; run?: RunAction }) {
  const b = view.booking;
  const [hsOpen, setHsOpen] = useState<number | null>(null);
  const missing = new Set(view.missing.map((m) => m.path));
  const skipped = new Set(b.skippedFields ?? []);

  // Bubble colour follows the field's state: just changed, still needed, or filled in.
  const tone = (path: string, value: string | null) =>
    highlight.has(path)
      ? "border-teal-300 bg-teal-50 ring-2 ring-teal-200"
      : !value && missing.has(path)
        ? "border-dashed border-amber-300 bg-amber-50/40"
        : "border-slate-200 bg-slate-50";
  const shown = (path: string, value: string | null, short = false) =>
    value ?? (skipped.has(path) ? (short ? "unknown" : "unknown (seller doesn't know)") : missing.has(path) ? "needed" : short ? "Not set" : "Not needed");
  const textTone = (path: string, value: string | null) =>
    value ? "font-semibold text-slate-900" : missing.has(path) ? "italic text-amber-700" : "text-slate-400";

  const F = ({ path, label, value }: { path: string; label: string; value: string | null }) => (
    <div className={`rounded-2xl border px-3.5 py-2.5 transition-all duration-700 ${tone(path, value)}`}>
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`mt-0.5 text-sm ${textTone(path, value)}`}>{shown(path, value)}</div>
    </div>
  );

  const done = view.missing.length === 0;

  return (
    <section className="paper card rounded-2xl p-4" data-tour="booking-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900">Booking <span className="num font-semibold">{b.bookingId}</span></h3>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${done ? "bg-emerald-500" : "bg-amber-500"}`} />
          {done ? "All details collected" : `${view.missing.length} detail${view.missing.length > 1 ? "s" : ""} to go`}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <F path="booking.sellerName" label="Seller" value={b.sellerName} />
        <F path="booking.originCity" label="From" value={b.originCity ? `${b.originCity}, UK` : null} />
        <F path="booking.destinationCity" label="To" value={b.destinationCity ? `${b.destinationCity}, ${b.destinationCountry}` : null} />
        <F path="booking.destinationType" label="Site type" value={b.destinationType} />
        {b.pendingReadyDate && !b.readyToShipDate ? (
          <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-3.5 py-2.5" title="This date is in the past, so it hasn't been saved. Confirm or correct it in the chat.">
            <div className="text-[11px] font-medium text-amber-800">Ready to ship</div>
            <div className="mt-0.5 text-sm italic text-amber-800">{isoToDisplay(b.pendingReadyDate.value)}? Not saved, past date</div>
          </div>
        ) : (
          <F path="booking.readyToShipDate" label="Ready to ship" value={b.readyToShipDate ? isoToDisplay(b.readyToShipDate) : null} />
        )}
        <F path="booking.sellerPriority" label="Priority" value={b.sellerPriority} />
        <F path="booking.pallets" label="Pallets" value={b.pallets != null ? num(b.pallets) : null} />
        <F path="booking.cartons" label="Total cartons" value={b.cartons != null ? num(b.cartons) : null} />
        <F path="booking.grossWeightKg" label="Gross weight" value={b.grossWeightKg != null ? kg(b.grossWeightKg) : null} />
        <F path="booking.declaredValue" label="Declared value" value={b.declaredValue != null ? gbp0(b.declaredValue) : null} />
        <F path="booking.deliveryAppointmentBooked" label="Delivery slot booked" value={b.deliveryAppointmentBooked == null ? null : b.deliveryAppointmentBooked ? "Yes" : "No"} />
      </div>

      <div className="mt-5 flex items-center gap-2">
        <span className="label-xs">Items</span>
        {view.items.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{view.items.length}</span>}
      </div>
      {view.items.length === 0 ? (
        <p className={`mt-2 rounded-2xl border border-dashed px-3.5 py-3 text-sm italic ${missing.has("items") ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-400"}`}>
          No products yet
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {view.items.map((it, i) => {
            const p = (f: string) => `items.${i}.${f}`;
            // A missing or too-short HS code gets a "Suggest" button that opens suggestions under the item.
            const hsNeeded = (it.hsCode ?? "").replace(/\D/g, "").length < 6;
            const chip = (f: string, label: string, v: string | null) => (
              <span key={f} className={`inline-flex items-baseline gap-1.5 rounded-full border px-3 py-1 text-xs transition-all duration-700 ${tone(p(f), v)}`}>
                <span className="text-slate-500">{label}</span>
                <span className={textTone(p(f), v)}>{shown(p(f), v, true)}</span>
              </span>
            );
            return (
              <li key={i} className={`rounded-2xl border p-3 transition-all duration-700 ${tone(p("description"), it.description)}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    {it.sku && <span className="num mr-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700">{it.sku}</span>}
                    <span className={textTone(p("description"), it.description)}>{it.description ?? shown(p("description"), null, true)}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${tone(p("hsCode"), it.hsCode)}`}>
                    <span className="text-slate-500">HS</span>
                    <span className={`num ${textTone(p("hsCode"), it.hsCode)}`}>{shown(p("hsCode"), it.hsCode, true)}</span>
                    {run && hsNeeded && it.description && (
                      <button type="button" className="ml-1 font-semibold text-teal-700 hover:underline" onClick={() => setHsOpen(hsOpen === i ? null : i)}>
                        {hsOpen === i ? "Hide" : "Suggest"}
                      </button>
                    )}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {chip("quantity", "Qty", it.quantity != null ? num(it.quantity) : null)}
                  {chip("unitPrice", "Price", it.unitPrice != null ? gbp0(it.unitPrice) : null)}
                  {chip("unitsPerCarton", "Per carton", it.unitsPerCarton != null ? num(it.unitsPerCarton) : null)}
                  {chip("cartons", "Cartons", it.cartons != null ? num(it.cartons) : null)}
                  {chip("unitWeightKg", "kg/unit", it.unitWeightKg != null ? num(it.unitWeightKg, 3) : null)}
                  {chip("countryOfOrigin", "Origin", it.countryOfOrigin)}
                </div>
                {run && hsOpen === i && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-[var(--color-card)] p-3">
                    <HsSuggest
                      key={it.description ?? ""}
                      autoLoad
                      description={it.description}
                      current={it.hsCode}
                      onPick={async (code) => {
                        const err = await run({ type: "apply", path: `items.${i}.hsCode`, value: code, ruleId: "R-01", suggested: true });
                        if (!err) setHsOpen(null);
                        return err;
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
