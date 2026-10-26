"use client";
import { useState } from "react";
import { carrierLabel } from "@/lib/carriers";
import { addDaysISO, gbp0, isoToDisplay, kg, num } from "@/lib/format";
import type { BookingPayload } from "@/lib/server/payload";
import type { RunAction } from "./FlightDeck";
import { CarrierEmailPanel } from "./CarrierEmailPanel";
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

  const confirmedAt = b.sellerConfirmedAt
    ? new Date(b.sellerConfirmedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : null;
  const blockedReason =
    view.readiness === "grounded"
      ? "Fix the critical (Red) issues above before you can confirm."
      : view.missing.length
        ? "Add the missing details before you can confirm."
        : null;

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">Booking confirmation & next steps</h3>
        {confirmedAt && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
            <Check className="h-3.5 w-3.5" /> Confirmed
          </span>
        )}
      </div>
      {!confirmedAt && (
        <p className="mt-1 text-sm text-slate-600">
          {blockedReason ??
            (view.readiness === "attention"
              ? "No blocking issues. You can confirm now, and any warnings stay on record."
              : "Everything checks out. Review the summary below and confirm.")}
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

      {/* The result appears where the button was, so it is never off-screen. */}
      {confirmedAt ? (
        <div role="status" className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="font-semibold">Booking confirmed on {confirmedAt}</div>
            <p className="mt-0.5 text-emerald-800">
              Your booking is prepared. CargoPilot has not sent it to the carrier or customs, so follow the steps above to hand it over.
              If you change any detail, you&apos;ll be asked to confirm again.
            </p>
          </div>
        </div>
      ) : (
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
            <Check className="h-4 w-4" /> {busy ? "Confirming…" : "Confirm booking details"}
          </button>
          <span className="text-xs text-slate-500">
            {blockedReason ?? "Confirming prepares the booking. It doesn't book the carrier or clear customs."}
          </span>
        </div>
      )}
      {confirmedAt && <CarrierEmailPanel data={data} run={run} />}
      {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
    </section>
  );
}
