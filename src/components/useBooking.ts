"use client";
import { useCallback, useState } from "react";
import type { BookingPayload } from "@/lib/server/payload";
import type { Action } from "./FlightDeck";

export function useBooking(initial: BookingPayload | null) {
  const [data, setData] = useState<BookingPayload | null>(initial);
  const run = useCallback(
    async (a: Action): Promise<string | null> => {
      if (!data) return "No booking yet.";
      // Emailing the carrier has its own endpoint; every other action goes through /actions.
      const { type, ...rest } = a;
      const res = await fetch(`/api/bookings/${data.id}/${type === "email" ? "email" : "actions"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(type === "email" ? rest : a),
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
