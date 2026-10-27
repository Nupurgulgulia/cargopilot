"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RULEBOOK } from "@/lib/constants";
import { SAMPLE_MESSAGES } from "@/lib/samples";
import type { BookingPayload } from "@/lib/server/payload";
import { AddressesCard } from "./AddressesCard";
import { BookingSummary } from "./BookingSummary";
import { FlightDeck } from "./FlightDeck";
import { Logo, Send } from "./icons";
import { gsap, reducedMotion, useGSAP } from "./motion/gsap";
import { ReadinessBadge } from "./status";
import { useBooking } from "./useBooking";

type Msg = { role: "user" | "assistant"; content: string; changes?: string[] };

const GREETING =
  "Hi, I'm your shipment co-pilot. Tell me what you're sending, where it's going and how many pallets. I'll ask for anything that's missing, check your booking against 10 rules and suggest the best carrier.";

export function ChatWorkspace({ initial }: { initial: BookingPayload | null }) {
  const { data, setData, run } = useBooking(initial);
  const [msgs, setMsgs] = useState<Msg[]>(initial?.messages ?? []);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);
  const thread = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, sending]);

  // A message handed over from the command palette (/chat?q=…) is sent straight away.
  const sentQ = useRef(false);
  useEffect(() => {
    if (initial || sentQ.current) return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (!q) return;
    sentQ.current = true;
    window.history.replaceState(null, "", "/chat");
    send(q);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Each new message rises in; the examples stagger in on first load.
  useGSAP(
    () => {
      if (reducedMotion()) return;
      const all = thread.current?.querySelectorAll("[data-msg]");
      const last = all?.[all.length - 1];
      if (last && msgs.length) gsap.fromTo(last, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.45, ease: "manifest" });
      else gsap.fromTo("[data-sample]", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "manifest", delay: 0.2 });
    },
    { scope: thread, dependencies: [msgs.length] },
  );

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
      <section className="card flex h-[calc(100vh-7rem)] min-h-[480px] flex-col overflow-hidden lg:sticky lg:top-[4.5rem]">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <div>
            <div className="label-xs flex items-center gap-1.5">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--color-signal)] text-[var(--color-signal)]" /> Co-pilot online
            </div>
            <h1 className="mt-0.5 text-lg font-bold text-slate-900">New shipment</h1>
            <p className="text-xs text-slate-500">Write as you normally would. You can change any detail at any time.</p>
          </div>
          {data && <ReadinessBadge r={data.view.readiness} />}
        </div>
        <div ref={thread} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div data-tour="chat-greeting"><Bubble m={{ role: "assistant", content: GREETING }} /></div>
          {msgs.length === 0 && (
            <div className="space-y-2 pl-9" data-tour="chat-examples">
              <div className="label-xs">Or start from an example</div>
              {SAMPLE_MESSAGES.map((s) => (
                <button
                  key={s.title}
                  data-sample
                  onClick={() => send(s.text)}
                  className="spotlight group block w-full rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] px-3.5 py-3 text-left transition-colors hover:border-teal-500"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{s.title}</span>
                    <span className="font-mono text-[10.5px] text-slate-500 group-hover:text-[var(--color-signal)]">{s.lane}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{s.text}</span>
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => <Bubble key={i} m={m} />)}
          {sending && (
            <div className="flex items-center gap-2 pl-1 text-sm text-slate-500">
              <Logo className="h-6 w-6" />
              <span className="typing flex gap-1 text-[var(--color-signal)]"><span>●</span><span>●</span><span>●</span></span>
              <span className="font-mono text-[11px] uppercase tracking-wide">Reading your message · re-running the checks</span>
            </div>
          )}
          <div ref={endRef} />
        </div>
        {error && <div className="mx-4 mb-2 rounded-[8px] bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}
        <form
          className="flex items-end gap-2 border-t border-[var(--color-line)] bg-[var(--color-raised)] p-3"
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
          <button className="btn-dark h-11 w-11 shrink-0 rounded-full px-0" disabled={sending || !text.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </section>

      {/* Live booking + Flight Deck */}
      <div className="space-y-4">
        {data ? (
          <>
            <BookingSummary view={data.view} highlight={highlight} run={run} />
            <AddressesCard view={data.view} run={run} />
            <FlightDeck data={data} run={run} compact />
            <div className="text-right">
              <Link href={`/booking/${data.id}`} className="btn-ghost text-sm">Open full Flight Deck & report →</Link>
            </div>
          </>
        ) : (
          <div className="card flex h-full min-h-80 flex-col justify-between overflow-hidden" data-tour="live-manifest">
            <div className="p-8">
              <div className="eyebrow">Live manifest</div>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Your booking takes shape here</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600">
                Each detail you share fills in a field. Once there&apos;s enough to go on, all ten pre-flight checks run live and the Carrier Matchmaker ranks options for your priority.
              </p>
            </div>
            <ol className="grid grid-cols-5 border-t border-[var(--color-line)] sm:grid-cols-10">
              {RULEBOOK.map((r, i) => (
                <li key={r.id} className="flex flex-col items-center gap-1 border-[var(--color-line)] py-4 [&:not(:last-child)]:border-r">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-slate-300" style={{ animationDelay: `${i * 120}ms` }} />
                  <span className="font-mono text-[10px] text-slate-500">{r.id}</span>
                  <span className="hidden text-[9.5px] text-slate-400 sm:block">{r.short}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  if (m.role === "user")
    return (
      <div data-msg className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-md bg-[var(--color-signal)] px-4 py-2.5 text-sm text-white">{m.content}</div>
      </div>
    );
  return (
    <div data-msg className="flex gap-2">
      <Logo className="mt-0.5 h-7 w-7 shrink-0" />
      <div className="max-w-[88%] space-y-1.5">
        <div className="whitespace-pre-wrap rounded-3xl rounded-tl-md bg-slate-50 px-4 py-2.5 text-sm leading-relaxed text-slate-900">{m.content}</div>
        {m.changes && m.changes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {m.changes.slice(0, 8).map((c, i) => (
              <span key={i} className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800">✓ {c}</span>
            ))}
            {m.changes.length > 8 && <span className="text-[11px] text-slate-500">+{m.changes.length - 8} more</span>}
          </div>
        )}
      </div>
    </div>
  );
}
