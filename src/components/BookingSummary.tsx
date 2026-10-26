"use client";
import { Fragment, useState } from "react";
import { gbp0, isoToDisplay, kg, num } from "@/lib/format";
import type { BookingView } from "@/lib/types";
import type { RunAction } from "./FlightDeck";
import { HsSuggest } from "./HsSuggest";

// Live structured view of what the chat has collected so far.
export function BookingSummary({ view, highlight, run }: { view: BookingView; highlight: Set<string>; run?: RunAction }) {
  const b = view.booking;
  const [hsOpen, setHsOpen] = useState<number | null>(null);
  const missing = new Set(view.missing.map((m) => m.path));
  const skipped = new Set(b.skippedFields ?? []);

  const F = ({ path, label, value }: { path: string; label: string; value: string | null }) => {
    const isMissing = missing.has(path);
    const isSkipped = skipped.has(path);
    return (
      <div className={`rounded-md px-2 py-1.5 transition-colors duration-700 ${highlight.has(path) ? "bg-teal-100" : ""}`}>
        <div className="text-[11px] text-slate-500">{label}</div>
        <div className={`text-sm ${value ? "font-medium text-slate-900" : isMissing ? "italic text-amber-700" : "text-slate-400"}`}>
          {value ?? (isSkipped ? "unknown (seller doesn't know)" : isMissing ? "needed" : "Not needed")}
        </div>
      </div>
    );
  };

  return (
    <section className="card p-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-slate-900">Booking {b.bookingId}</h3>
        <span className="text-xs text-slate-500">{view.missing.length ? `${view.missing.length} detail${view.missing.length > 1 ? "s" : ""} to go` : "All details collected"}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
        <F path="booking.sellerName" label="Seller" value={b.sellerName} />
        <F path="booking.originCity" label="From" value={b.originCity ? `${b.originCity}, UK` : null} />
        <F path="booking.destinationCity" label="To" value={b.destinationCity ? `${b.destinationCity}, ${b.destinationCountry}` : null} />
        <F path="booking.destinationType" label="Site type" value={b.destinationType} />
        {b.pendingReadyDate && !b.readyToShipDate ? (
          <div className="rounded-md bg-amber-50 px-2 py-1.5" title="This date is in the past, so it hasn't been saved. Confirm or correct it in the chat.">
            <div className="text-[11px] text-amber-800">Ready to ship</div>
            <div className="text-sm italic text-amber-800">{isoToDisplay(b.pendingReadyDate.value)}? Not saved, past date</div>
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
      <div className="mt-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Items</div>
      {view.items.length === 0 ? (
        <p className={`px-1 text-sm italic ${missing.has("items") ? "text-amber-700" : "text-slate-400"}`}>No products yet</p>
      ) : (
        <div className="mt-1 overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead className="text-slate-500">
              <tr className="text-left">
                <th className="px-1 py-1 font-medium">Product</th><th className="px-1 font-medium">HS</th><th className="px-1 font-medium">Qty</th>
                <th className="px-1 font-medium">Price</th><th className="px-1 font-medium">Per ctn</th><th className="px-1 font-medium">Ctns</th>
                <th className="px-1 font-medium">kg/unit</th><th className="px-1 font-medium">Origin</th>
              </tr>
            </thead>
            <tbody>
              {view.items.map((it, i) => {
                const cell = (f: string, v: string | null) => (
                  <td className={`px-1 py-1 transition-colors duration-700 ${highlight.has(`items.${i}.${f}`) ? "bg-teal-100" : ""} ${v ? "text-slate-900" : missing.has(`items.${i}.${f}`) ? "italic text-amber-700" : "text-slate-400"}`}>
                    {v ?? (skipped.has(`items.${i}.${f}`) ? "unknown" : missing.has(`items.${i}.${f}`) ? "needed" : "Not set")}
                  </td>
                );
                // A missing or too-short HS code gets a "Suggest" link that opens suggestions under the row.
                const hsNeeded = (it.hsCode ?? "").replace(/D/g, "").length < 6;
                return (
                  <Fragment key={i}>
                  <tr className="border-t border-slate-100">
                    {cell("description", it.description ? `${it.sku ? `${it.sku} · ` : ""}${it.description}` : null)}
                    {run && hsNeeded && it.description ? (
                      <td className="px-1 py-1">
                        <span className={it.hsCode ? "text-slate-900" : "italic text-amber-700"}>{it.hsCode ?? "needed"}</span>{" "}
                        <button type="button" className="font-medium text-teal-700 hover:underline" onClick={() => setHsOpen(hsOpen === i ? null : i)}>
                          {hsOpen === i ? "Hide" : "Suggest"}
                        </button>
                      </td>
                    ) : (
                      cell("hsCode", it.hsCode)
                    )}
                    {cell("quantity", it.quantity != null ? num(it.quantity) : null)}
                    {cell("unitPrice", it.unitPrice != null ? gbp0(it.unitPrice) : null)}
                    {cell("unitsPerCarton", it.unitsPerCarton != null ? num(it.unitsPerCarton) : null)}
                    {cell("cartons", it.cartons != null ? num(it.cartons) : null)}
                    {cell("unitWeightKg", it.unitWeightKg != null ? num(it.unitWeightKg, 3) : null)}
                    {cell("countryOfOrigin", it.countryOfOrigin)}
                  </tr>
                  {run && hsOpen === i && (
                    <tr>
                      <td colSpan={8} className="bg-slate-50 px-2 py-2">
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
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
