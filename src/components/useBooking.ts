"use client";
import { useCallback, useState } from "react";
import type { BookingPayload } from "@/lib/server/payload";
import type { Action } from "./FlightDeck";
import { toast } from "./motion/Toaster";
import { READINESS_META } from "./status";

// What to tell the user after each kind of action succeeds.
function title(a: Action): string {
  if (a.type === "confirm") return "Booking confirmed";
  if (a.type === "email") return "Email sent to the carrier";
  if (a.type === "keep") return `Kept your value for ${a.ruleId}`;
  if (a.type === "unkeep") return `Note removed for ${a.ruleId}`;
  if (a.type === "approve") return "Invoice approved";
  if (a.path.startsWith("invoice.") || a.path.startsWith("compliance.") || a.path === "labelNote") return "Saved";
  if (a.path === "booking.chosenCarrier") return a.value ? "Carrier chosen" : "Back to the recommended carrier";
  if (a.path === "booking.sellerPriority") return `Priority set to ${a.value}`;
  return a.ruleId ? `Fix applied for ${a.ruleId}` : "Booking updated";
}

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
      const now = (json as BookingPayload).view?.readiness;
      toast(title(a), { body: now ? `All 10 checks re-run · ${READINESS_META[now].label}` : undefined, tone: now === "grounded" ? "error" : now === "attention" ? "warn" : "ok" });
      return null;
    },
    [data],
  );
  return { data, setData, run };
}
