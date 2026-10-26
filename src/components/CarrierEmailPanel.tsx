"use client";
import { useEffect, useState } from "react";
import { chosenCarrier } from "@/lib/carrierEmail";
import { carrierLabel } from "@/lib/carriers";
import type { BookingPayload } from "@/lib/server/payload";
import type { RunAction } from "./FlightDeck";
import { Check, Send } from "./icons";

// Browser-only memory of addresses, so repeat bookings don't need retyping.
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) ?? "";
    } catch {
      return "";
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function CarrierEmailPanel({ data, run }: { data: BookingPayload; run: RunAction }) {
  const carrier = chosenCarrier(data.view);
  const carrierKey = `cp_carrier_email:${carrier?.carrier.carrier ?? "any"}`;
  const [to, setTo] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ subject: string; text: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    setTo(store.get(carrierKey));
    setReplyTo(store.get("cp_reply_to"));
  }, [carrierKey]);

  const sent = data.email.sent.filter((e) => e.status === "sent");
  const name = carrier ? carrierLabel(carrier.carrier) : "the carrier";

  async function loadPreview() {
    const q = new URLSearchParams({ replyTo: replyTo || "you@example.com", note });
    const res = await fetch(`/api/bookings/${data.id}/email?${q}`);
    if (res.ok) setPreview(await res.json());
  }

  if (!data.email.enabled) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
        Emailing the carrier from CargoPilot isn&apos;t switched on yet.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900">Email {name}</h4>
        {sent.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
            <Check className="h-3.5 w-3.5" /> Sent
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Sends the checked booking details to the carrier and asks them to confirm the collection slot and price. Replies go to your email.
      </p>

      {sent.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-slate-600">
          {sent.map((e) => (
            <li key={e.id} className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-600" /> Sent to <b className="font-medium text-slate-800">{e.to_email}</b> on {when(e.created_at)}
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 space-y-2"
        onSubmit={async (ev) => {
          ev.preventDefault();
          setBusy(true);
          setError(null);
          const err = await run({ type: "email", to: to.trim(), replyTo: replyTo.trim(), note: note.trim() || undefined });
          setBusy(false);
          if (err) setError(err);
          else {
            store.set(carrierKey, to.trim());
            store.set("cp_reply_to", replyTo.trim());
            setNote("");
            setShowPreview(false);
          }
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            Carrier&apos;s email
            <input className="input mt-1" type="email" required placeholder="bookings@carrier.com" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Your email (for replies)
            <input className="input mt-1" type="email" required placeholder="you@company.com" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
          </label>
        </div>
        <label className="block text-xs font-medium text-slate-700">
          Note to the carrier <span className="font-normal text-slate-400">(optional)</span>
          <textarea className="input mt-1 min-h-14" maxLength={500} placeholder="For example: tail-lift needed at collection" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={busy || !to.trim() || !replyTo.trim()}>
            <Send className="h-4 w-4" /> {busy ? "Sending…" : sent.length ? "Send again" : "Send to carrier"}
          </button>
          <button
            type="button"
            className="rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            onClick={async () => {
              if (!showPreview) await loadPreview();
              setShowPreview((s) => !s);
            }}
          >
            {showPreview ? "Hide preview" : "Preview email"}
          </button>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
      </form>

      {showPreview && preview && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="text-slate-500">Subject</div>
          <div className="font-medium text-slate-900">{preview.subject}</div>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-700">{preview.text}</pre>
        </div>
      )}
    </div>
  );
}
