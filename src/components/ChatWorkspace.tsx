"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { BookingPayload } from "@/lib/server/payload";
import { BookingSummary } from "./BookingSummary";
import { FlightDeck } from "./FlightDeck";
import { Logo, Send } from "./icons";
import { ReadinessBadge } from "./status";
import { useBooking } from "./useBooking";

type Msg = { role: "user" | "assistant"; content: string; changes?: string[] };

const GREETING =
  "Hi, I'm your shipment co-pilot. Tell me what you're sending, where it's going and how many pallets. I'll ask for anything that's missing, check your booking against 10 rules and suggest the best carrier.";

const SAMPLES = [
  "Hi, I need to ship 1,000 ceramic mugs from Manchester to our warehouse in Frankfurt. 3 pallets, cheapest option please.",
  "We're sending 400 cotton tote bags and 200 wireless earbuds from London to a shop in Paris, as fast as possible.",
  "Northfield Goods here. Shipping from Leeds to a business address in Rotterdam, ready 20-11-2026, balanced priority. 2 pallets, 60 cartons, 700 kg gross, declared value £6,000. Items: 1,200 steel water bottles, SKU BTL-01, HS 732393, £5 each, 20 per carton, 60 cartons, 0.45 kg each, made in China.",
];

export function ChatWorkspace({ initial }: { initial: BookingPayload | null }) {
  const { data, setData, run } = useBooking(initial);
  const [msgs, setMsgs] = useState<Msg[]>(initial?.messages ?? []);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, sending]);

  async function send(message: string) {
    const m = message.trim();
    if (!m || sending) return;
    setText("");
    setError(null);
    setMsgs((x) => [...x, { role: "user", content: m }]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: data?.id, message: m }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      const { reply, changes, ...payload } = json as BookingPayload & { reply: string; changes: { label: string; path: string }[] };
      setData(payload);
      setMsgs((x) => [...x, { role: "assistant", content: reply, changes: changes.map((c) => c.label) }]);
      setHighlight(new Set(changes.map((c) => c.path)));
      setTimeout(() => setHighlight(new Set()), 2500);
      if (!data) window.history.replaceState(null, "", `/chat/${payload.id}`);
    } catch (e) {
      setError(`${(e as Error).message} Your booking is saved, so you can try sending again.`);
      setText(m);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Chat */}
      <section className="card flex h-[calc(100vh-7rem)] min-h-[480px] flex-col lg:sticky lg:top-[4.5rem]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight text-slate-900">New shipment</h1>
            <p className="text-xs text-slate-500">Write as you normally would. You can change any detail at any time.</p>
          </div>
          {data && <ReadinessBadge r={data.view.readiness} />}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <Bubble m={{ role: "assistant", content: GREETING }} />
          {msgs.length === 0 && (
            <div className="space-y-2 pl-9">
              <div className="label-xs">Or start from an example</div>
              {SAMPLES.map((s) => (
                <button key={s} onClick={() => send(s)} className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:border-teal-500 hover:bg-teal-50/40">
                  {s}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => <Bubble key={i} m={m} />)}
          {sending && (
            <div className="flex items-center gap-2 pl-1 text-sm text-slate-500">
              <Logo className="h-6 w-6 text-teal-600" />
              <span className="typing flex gap-1"><span>●</span><span>●</span><span>●</span></span>
              <span className="text-xs">Reading your message and re-running the checks…</span>
            </div>
          )}
          <div ref={endRef} />
        </div>
        {error && <div className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}
        <form
          className="flex gap-2 border-t border-slate-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <textarea
            className="input max-h-40 min-h-11 resize-none"
            rows={1}
            value={text}
            placeholder={data ? "Answer, or change any detail (for example, “add a pallet”)" : "e.g. 500 cotton t-shirts from London to a warehouse in Berlin…"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
          />
          <button className="btn-primary px-3" disabled={sending || !text.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </section>

      {/* Live booking + Flight Deck */}
      <div className="space-y-4">
        {data ? (
          <>
            <BookingSummary view={data.view} highlight={highlight} />
            <FlightDeck data={data} run={run} compact />
            <div className="text-right">
              <Link href={`/booking/${data.id}`} className="text-sm font-medium text-teal-700 hover:underline">Open full Flight Deck & report →</Link>
            </div>
          </>
        ) : (
          <div className="card flex h-full min-h-80 flex-col items-center justify-center gap-2 p-8 text-center">
            <Logo className="h-10 w-10 text-teal-600" />
            <h2 className="text-base font-semibold tracking-tight text-slate-900">Your booking takes shape here</h2>
            <p className="max-w-md text-sm text-slate-600">
              Each detail you share fills in a field. Once there&apos;s enough to go on, all ten pre-flight checks run live and the Carrier Matchmaker ranks options for your priority.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  if (m.role === "user")
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-navy-900 px-3.5 py-2 text-sm text-white">{m.content}</div>
      </div>
    );
  return (
    <div className="flex gap-2">
      <Logo className="mt-0.5 h-7 w-7 shrink-0 text-teal-600" />
      <div className="max-w-[88%] space-y-1.5">
        <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-slate-100 px-3.5 py-2 text-sm text-slate-900">{m.content}</div>
        {m.changes && m.changes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {m.changes.slice(0, 8).map((c, i) => (
              <span key={i} className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] text-teal-800">✓ {c}</span>
            ))}
            {m.changes.length > 8 && <span className="text-[11px] text-slate-500">+{m.changes.length - 8} more</span>}
          </div>
        )}
      </div>
    </div>
  );
}
