"use client";
import Link from "next/link";
import type { BookingPayload } from "@/lib/server/payload";
import { isoToDisplay } from "@/lib/format";
import { AddressesCard } from "./AddressesCard";
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
              <><Link className="font-medium text-teal-700 hover:underline" href={`/audit/${data.uploadId}`}>← Back to audit</Link> · Workbook{b.sourceRow ? `, Bookings row ${b.sourceRow}` : ""}</>
            ) : (
              <>Started in chat · <Link className="font-medium text-teal-700 hover:underline" href={`/chat/${data.id}`}>Continue the conversation →</Link></>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {b.bookingId} {b.sellerName && <span className="text-slate-600">· {b.sellerName}</span>}
          </h1>
          <p className="mt-1 text-sm text-slate-700">
            {b.originCity ?? "?"} → {b.destinationCity ?? "?"}{b.destinationCountry ? `, ${b.destinationCountry}` : ""} · Ready {isoToDisplay(b.readyToShipDate)} · Priority: {b.sellerPriority ?? "not set"}
          </p>
        </div>
      </div>
      <BookingSummary view={data.view} highlight={new Set()} run={run} />
      <AddressesCard view={data.view} run={run} />
      {data.source === "upload" && data.original && <OriginalNote />}
      <FlightDeck data={data} run={run} />
    </div>
  );
}

function OriginalNote() {
  return (
    <p className="text-xs text-slate-500">
      Every correction is saved with its original value (see Audit trail below). Your uploaded workbook is never modified.
    </p>
  );
}
