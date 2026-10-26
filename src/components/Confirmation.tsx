"use client";
import { useState } from "react";
import { carrierLabel } from "@/lib/carriers";
import { addDaysISO, gbp0, isoToDisplay, kg, num } from "@/lib/format";
import type { BookingPayload } from "@/lib/server/payload";
import type { RunAction } from "./FlightDeck";
import { Check } from "./icons";

export function Confirmation({ data, run }: { data: BookingPayload; run: RunAction }) {
  const { view } = data;
  const b = view.booking;
  const rec = view.carriers;
  const carrier = rec.selected && rec.selected.eligible !== false ? rec.selected : rec.recommended;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canConfirm = view.readiness !== "grounded" && view.missing.length === 0;
  const units = view.items.reduce((s, it) => s + (it.quantity ?? 0), 0);

  const rows: [string, string][] = [
    ["Booking", `${b.bookingId ?? "Not set"}${b.sellerName ? ` · ${b.sellerName}` : ""}`],
    ["Route", `${b.originCity ?? "?"}, UK → ${b.destinationCity ?? "?"}${b.destinationCountry ? `, ${b.destinationCountry}` : ""} (${b.destinationType ?? "site type ?"})`],
    ["Goods", view.items.length ? `${view.items.map((it) => `${num(it.quantity ?? 0)} × ${it.description ?? it.sku}`).join("; ")}` : "No items yet"],
    ["Packing", `${b.cartons ?? "?"} cartons on ${b.pallets ?? "?"} pallet${b.pallets === 1 ? "" : "s"} · ${b.grossWeightKg != null ? kg(b.grossWeightKg) : "?"} gross · ${num(units)} units`],
    ["Declared value", b.declaredValue != null ? gbp0(b.declaredValue) : "Not set"],
    ["Collection", b.readyToShipDate ? isoToDisplay(b.readyToShipDate) : "Not set"],
    ["Carrier", carrier ? `${carrierLabel(carrier.carrier)}${carrier.totalCost != null ? ` · ${gbp0(carrier.totalCost)}` : ""}` : rec.unavailableReason ?? "Not chosen yet"],
    ["Estimated delivery", carrier && b.readyToShipDate ? `${isoToDisplay(addDaysISO(b.readyToShipDate, carrier.carrier.transitDays))} (${carrier.carrier.transitDays} days, ${carrier.carrier.onTimeRate}% on time)` : "Not known yet"],
    ["Delivery slot", b.destinationType === "Warehouse" ? (b.deliveryAppointmentBooked ? "Booked" : "Not booked yet") : "Not needed (business address)"],
  ];

  return (
    <section className="card p-4">
      <h3 className="font-semibold text-slate-900">Booking confirmation & next steps</h3>
      {b.sellerConfirmedAt ? (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <b>Confirmed by you</b> on {new Date(b.sellerConfirmedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. Your booking is
            prepared, but CargoPilot has not sent it to the carrier or customs. Follow the steps below to hand it over.
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm text-slate-600">
          {view.readiness === "grounded"
            ? "This booking can't be confirmed until the Red issues are fixed."
            : view.missing.length
              ? "A few details are still missing before you can confirm."
              : view.readiness === "attention"
                ? "No blocking issues. You can confirm now, and any warnings stay on record."
                : "Everything checks out. Review the summary and confirm."}
        </p>
      )}

      <dl className="mt-3 divide-y divide-slate-100 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[130px_1fr] gap-2 py-1.5">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>

      <h4 className="mt-4 text-sm font-semibold text-slate-900">What happens next</h4>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-700">
        {view.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>

      {!b.sellerConfirmedAt && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="btn-primary"
            disabled={!canConfirm || busy}
            onClick={async () => {
              setBusy(true);
              setErr(await run({ type: "confirm" }));
              setBusy(false);
            }}
          >
            <Check className="h-4 w-4" /> Confirm booking details
          </button>
          <span className="text-xs text-slate-500">Confirming prepares the booking. It doesn&apos;t book the carrier or clear customs.</span>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
    </section>
  );
}
