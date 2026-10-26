"use client";
import { useEffect, useRef, useState } from "react";
import { gsap, reducedMotion } from "./gsap";

export type ToastTone = "ok" | "info" | "warn" | "error";
interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
}

/** Show a toast from anywhere: toast("Fix applied", { body: "R-05 now passes", tone: "ok" }). */
export function toast(title: string, opts: { body?: string; tone?: ToastTone } = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("cp-toast", { detail: { title, body: opts.body, tone: opts.tone ?? "ok" } }));
}

const TONE: Record<ToastTone, string> = {
  ok: "bg-emerald-600",
  info: "bg-[var(--color-signal)]",
  warn: "bg-amber-500",
  error: "bg-red-600",
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as Omit<ToastItem, "id">;
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { id, ...d }]);
      window.setTimeout(() => dismiss(id), 4200);
    };
    window.addEventListener("cp-toast", on);
    return () => window.removeEventListener("cp-toast", on);
  }, []);

  function dismiss(id: number) {
    const el = document.querySelector<HTMLElement>(`[data-toast="${id}"]`);
    const remove = () => setItems((xs) => xs.filter((x) => x.id !== id));
    if (!el || reducedMotion()) return remove();
    gsap.to(el, { opacity: 0, x: 24, duration: 0.3, ease: "power2.in", onComplete: remove });
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[340px] max-w-[calc(100vw-2.5rem)] flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <ToastCard key={t.id} t={t} onClose={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ t, onClose }: { t: ToastItem; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && !reducedMotion()) gsap.from(ref.current, { y: 18, opacity: 0, scale: 0.97, duration: 0.45, ease: "manifest" });
  }, []);
  return (
    <div ref={ref} data-toast={t.id} className="ticket pointer-events-auto flex items-start gap-3 rounded-2xl p-3.5 text-slate-900 shadow-xl shadow-black/30">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[t.tone]}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{t.title}</div>
        {t.body && <div className="mt-0.5 text-xs text-slate-500">{t.body}</div>}
      </div>
      <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-900" aria-label="Dismiss">✕</button>
    </div>
  );
}
