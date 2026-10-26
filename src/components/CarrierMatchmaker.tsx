"use client";
import { useState } from "react";
import { SELLER_PRIORITIES } from "@/lib/constants";
import { carrierLabel } from "@/lib/carriers";
import { gbp0, kg, num } from "@/lib/format";
import type { BookingView, CarrierEvaluation } from "@/lib/types";
import type { RunAction } from "./FlightDeck";
import { Check, Stop, Truck } from "./icons";

export function CarrierMatchmaker({ view, run }: { view: BookingView; run: RunAction }) {
  const rec = view.carriers;
  const b = view.booking;
  const [busy, setBusy] = useState(false);
  const act = async (path: string, value: unknown) => {
    setBusy(true);
    await run({ type: "apply", path, value });
    setBusy(false);
  };
  const chosenId = b.chosenCarrier && rec.candidates.some((c) => c.carrier.id === b.chosenCarrier) ? b.chosenCarrier : null;
  const top = chosenId ? rec.candidates.find((c) => c.carrier.id === chosenId)! : rec.recommended;

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-teal-700" />
          <h3 className="font-semibold text-slate-900">Carrier Matchmaker</h3>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Priority
          <select
            className="input w-auto py-1 text-xs"
            value={b.sellerPriority ?? ""}
            disabled={busy}
            onChange={(e) => e.target.value && act("booking.sellerPriority", e.target.value)}
          >
            {!b.sellerPriority && <option value="">Choose…</option>}
            {SELLER_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
      </div>

      {rec.unavailableReason && !top ? (
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{rec.unavailableReason}</p>
      ) : top ? (
        <div className="mt-3 rounded-xl border-2 border-teal-600/70 bg-teal-50/40 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="label-xs text-teal-800">{chosenId ? "Your chosen carrier" : `Recommended · ${rec.priority}`}</div>
              <div className="text-lg font-semibold text-slate-900">{carrierLabel(top.carrier)}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold text-slate-900">{top.totalCost != null ? gbp0(top.totalCost) : `${gbp0(top.carrier.pricePerPallet)}/pallet`}</div>
              {top.totalCost != null && <div className="text-xs text-slate-500">{b.pallets} × {gbp0(top.carrier.pricePerPallet)} per pallet</div>}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <Metric label="Transit" value={`${top.carrier.transitDays} days`} />
            <Metric label="On time" value={`${top.carrier.onTimeRate}%`} />
            <Metric label="Pallet limit" value={kg(top.carrier.maxWeightPerPalletKg)} sub={top.weightPerPallet != null ? `yours: ${kg(top.weightPerPallet)}` : undefined} bad={top.eligible === false} />
          </div>
          {!chosenId && <p className="mt-3 text-sm text-slate-800"><b>Why:</b> {rec.reason}</p>}
          {chosenId && top.eligible === false && <p className="mt-3 text-sm text-red-800">This carrier can&apos;t take your pallet weight ({top.ineligibleReason}).</p>}
          {!chosenId && rec.tradeOff && <p className="mt-1 text-sm text-slate-700"><b>Trade-off:</b> {rec.tradeOff}</p>}
          {chosenId && (
            <button className="mt-2 text-xs font-medium text-teal-700 hover:underline" disabled={busy} onClick={() => act("booking.chosenCarrier", null)}>
              Go back to the recommendation{rec.recommended ? ` (${carrierLabel(rec.recommended.carrier)})` : ""}
            </button>
          )}
        </div>
      ) : null}

      {rec.candidates.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-2 pr-2 font-medium">Carrier · service</th>
                <th className="px-2 font-medium">Cost</th>
                <th className="px-2 font-medium">Transit</th>
                <th className="px-2 font-medium">On time</th>
                <th className="px-2 font-medium">Max/pallet</th>
                <th className="px-2 font-medium" title="40% cost + 30% speed + 30% reliability, each scaled 0–100">Balanced</th>
                <th className="px-2 font-medium">Fits load?</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rec.candidates.map((c) => (
                <Row key={c.carrier.id} c={c} current={top?.carrier.id === c.carrier.id} busy={busy} onPick={() => act("booking.chosenCarrier", c.carrier.id)} />
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            Rates from the case rate card (UK → {b.destinationCountry}). Cost = pallets × price per pallet. Balanced score = 40% cost + 30% speed + 30% reliability, each scaled 0–100 across this route&apos;s carriers.
          </p>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className="rounded-lg bg-white px-2 py-2 shadow-sm">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`font-semibold ${bad ? "text-red-700" : "text-slate-900"}`}>{value}</div>
      {sub && <div className={`text-[11px] ${bad ? "text-red-700" : "text-slate-500"}`}>{sub}</div>}
    </div>
  );
}

function Row({ c, current, busy, onPick }: { c: CarrierEvaluation; current: boolean; busy: boolean; onPick: () => void }) {
  return (
    <tr className={`border-b border-slate-100 ${current ? "bg-teal-50/60" : ""}`}>
      <td className="py-2 pr-2 font-medium text-slate-900">{carrierLabel(c.carrier)}</td>
      <td className="px-2">{c.totalCost != null ? gbp0(c.totalCost) : `${gbp0(c.carrier.pricePerPallet)}/pallet`}</td>
      <td className="px-2">{c.carrier.transitDays} d</td>
      <td className="px-2">{c.carrier.onTimeRate}%</td>
      <td className="px-2">{kg(c.carrier.maxWeightPerPalletKg)}</td>
      <td className="px-2">{c.balancedScore != null ? num(c.balancedScore, 0) : "n/a"}</td>
      <td className="px-2">
        {c.eligible === null ? (
          <span className="text-xs text-slate-500">needs weight</span>
        ) : c.eligible ? (
          <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-3.5 w-3.5" /> Yes</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-red-700" title={c.ineligibleReason}><Stop className="h-3.5 w-3.5" /> No</span>
        )}
      </td>
      <td className="py-1 text-right">
        {!current && c.eligible !== false && (
          <button className="text-xs font-medium text-teal-700 hover:underline" disabled={busy} onClick={onPick}>Choose</button>
        )}
      </td>
    </tr>
  );
}
