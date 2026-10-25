"use client";
import { useCallback, useState } from "react";
import type { BookingPayload } from "@/lib/server/payload";
import type { Action } from "./FlightDeck";

export function useBooking(initial: BookingPayload | null) {
  const [data, setData] = useState<BookingPayload | null>(initial);
  const run = useCallback(
    async (a: Action): Promise<string | null> => {
      if (!data) return "No booking yet.";
      const res = await fetch(`/api/bookings/${data.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
      });
      const json = await res.json().catch(() => ({ error: "Something went wrong." }));
      if (!res.ok) return json.error ?? "Something went wrong.";
      setData(json);
      return null;
    },
    [data],
  );
  return { data, setData, run };
}
