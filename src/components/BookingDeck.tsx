"use client";
import Link from "next/link";
import type { BookingPayload } from "@/lib/server/payload";
import { isoToDisplay } from "@/lib/format";
import { BookingSummary } from "./BookingSummary";
import { FlightDeck } from "./FlightDeck";
import { useBooking } from "./useBooking";

export function BookingDeck({ initial }: { initial: BookingPayload }) {
  const { data, run } = useBooking(initial);
  if (!data) return null;
  const b = data.view.booking;
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs text-slate-500">
            {data.source === "upload" ? (
              <>From workbook upload{b.sourceRow ? ` · Bookings row ${b.sourceRow}` : ""} · <Link className="text-teal-700 hover:underline" href={`/audit/${data.uploadId}`}>back to audit</Link></>
            ) : (
              <>From chat · <Link className="text-teal-700 hover:underline" href={`/chat/${data.id}`}>continue the conversation</Link></>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {b.bookingId} {b.sellerName && <span className="font-normal text-slate-500">· {b.sellerName}</span>}
          </h1>
          <p className="text-sm text-slate-600">
            {b.originCity ?? "?"} → {b.destinationCity ?? "?"}{b.destinationCountry ? `, ${b.destinationCountry}` : ""} · ready {isoToDisplay(b.readyToShipDate)} · priority {b.sellerPriority ?? "—"}
          </p>
        </div>
      </div>
      <BookingSummary view={data.view} highlight={new Set()} />
      {data.source === "upload" && data.original && <OriginalNote />}
      <FlightDeck data={data} run={run} />
    </div>
  );
}

function OriginalNote() {
  return (
    <p className="text-xs text-slate-500">
      Corrections here are saved in CargoPilot with their original values (see Change history). Your uploaded workbook is never modified.
    </p>
  );
}
