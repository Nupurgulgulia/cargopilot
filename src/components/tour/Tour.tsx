"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { STEPS, type TourContext } from "./steps";

// Guided tour. It only reads the page: no clicks on the user's behalf, no saves, no emails,
// no theme changes. Progress lives in sessionStorage (survives page changes); "seen",
// "dismissed" and the started/completed/skipped counts live in localStorage on this device.

const PREF_KEY = "cp-tour";
const STATS_KEY = "cp-tour-stats";
const RUN_KEY = "cp-tour-run";
const START_EVENT = "cp-tour-start";

interface Prefs { seen: boolean; dismissed: boolean }
interface Run { i: number; dir: 1 | -1; ctx: TourContext }

const read = <T,>(store: "local" | "session", key: string, fallback: T): T => {
  try {
    const raw = (store === "local" ? localStorage : sessionStorage).getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
};
const write = (store: "local" | "session", key: string, value: unknown) => {
  try {
    const s = store === "local" ? localStorage : sessionStorage;
    if (value == null) s.removeItem(key);
    else s.setItem(key, JSON.stringify(value));
  } catch {}
};
const prefs = () => read<Prefs>("local", PREF_KEY, { seen: false, dismissed: false });
const setPrefs = (p: Partial<Prefs>) => write("local", PREF_KEY, { ...prefs(), ...p });
/** Analytics are counts only, kept on this device: never booking data, never sent anywhere. */
const count = (what: "started" | "completed" | "skipped") => {
  const s = read("local", STATS_KEY, { started: 0, completed: 0, skipped: 0 });
  s[what] += 1;
  write("local", STATS_KEY, s);
};
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const here = () => location.pathname + location.search;

/** The element that opened the tour, so focus can go back to it. */
let trigger: HTMLElement | null = null;

export function startTour() {
  trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  window.dispatchEvent(new Event(START_EVENT));
}

export function TourButton({ label = "Take the tour" }: { label?: string }) {
  return (
    <button type="button" className="btn-ghost" data-tour-trigger onClick={startTour}>
      {label}
    </button>
  );
}

/** Offered once to someone new; never shown again after the tour is seen or dismissed. */
export function TourOffer() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const p = prefs();
    setShow(!p.seen && !p.dismissed);
    const hide = () => setShow(false);
    window.addEventListener(START_EVENT, hide);
    return () => window.removeEventListener(START_EVENT, hide);
  }, []);
  if (!show) return null;
  return (
    <div role="region" aria-label="Guided tour" className="card flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-3.5">
      <p className="text-sm text-slate-700"><b className="text-slate-900">New to CargoPilot?</b> Take a short tour of where everything is. It won&apos;t change anything.</p>
      <div className="flex gap-2">
        <button type="button" className="btn-dark" data-tour-trigger onClick={startTour}>Take the tour</button>
        <button type="button" className="btn-ghost" onClick={() => { setPrefs({ dismissed: true }); setShow(false); }}>Not now</button>
      </div>
    </div>
  );
}

const find = (target: string) => {
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  return el && el.getClientRects().length ? el : null;
};
const firstBooking = () => document.querySelector<HTMLElement>("[data-tour-booking]")?.dataset.tourBooking ?? null;

type View = { step: number; el: HTMLElement | null; sample: boolean };

export function TourHost() {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [dontShow, setDontShow] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const token = useRef(0);

  // Resume after a page change, and listen for "Take the tour".
  useEffect(() => {
    const saved = read<Run | null>("session", RUN_KEY, null);
    if (saved && typeof saved.i === "number") setRun(saved);
    const onStart = () => {
      count("started");
      setPrefs({ seen: true });
      setDontShow(prefs().dismissed);
      setRun({ i: 0, dir: 1, ctx: { bookingId: null } });
    };
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, []);
  useEffect(() => write("session", RUN_KEY, run), [run]);

  const close = useCallback((how: "completed" | "skipped") => {
    count(how);
    if (dontShow) setPrefs({ dismissed: true });
    setRun(null);
    setView(null);
    setRect(null);
    write("session", RUN_KEY, null);
    // Focus goes back to whatever opened the tour, or the tour button on this page.
    requestAnimationFrame(() => {
      const back = trigger?.isConnected ? trigger : document.querySelector<HTMLElement>("[data-tour-trigger]") ?? document.querySelector<HTMLElement>("main h1");
      if (back && !back.hasAttribute("tabindex") && back.tagName === "H1") back.setAttribute("tabindex", "-1");
      back?.focus();
      trigger = null;
    });
  }, [dontShow]);

  const go = useCallback((dir: 1 | -1) => setRun((r) => (r ? { ...r, i: r.i + dir, dir } : r)), []);

  // Resolve the current step: navigate if needed, wait for its element, skip it silently if absent.
  useEffect(() => {
    if (!run) return;
    const my = ++token.current;
    const step = STEPS[run.i];
    if (!step) { setRun((r) => (r ? { ...r, i: Math.max(0, Math.min(STEPS.length - 1, r.i)) } : r)); return; }
    if (step.when && !step.when(run.ctx)) { go(run.dir); return; }
    const path = step.path(run.ctx);
    if (path && here() !== path) router.push(path);
    let tries = 0, waitPage = 0;
    const tick = () => {
      if (my !== token.current) return;
      const onPage = !path || here() === path;
      // Learn the first recent booking while we're on the Overview.
      if (onPage && location.pathname === "/" && run.ctx.bookingId == null) {
        const id = firstBooking();
        if (id) { setRun((r) => (r ? { ...r, ctx: { bookingId: id } } : r)); return; }
      }
      const el = onPage && step.target ? find(step.target) : null;
      if (onPage && (el || !step.target)) {
        if (el) {
          const behavior = reducedMotion() ? "auto" : "smooth";
          const box = el.getBoundingClientRect();
          // Tall sections line up just below the floating nav so their heading stays in view.
          if (box.height > window.innerHeight * 0.6) window.scrollTo({ top: box.top + window.scrollY - 96, behavior });
          else el.scrollIntoView({ block: "center", behavior });
        }
        setView({ step: run.i, el, sample: false });
        return;
      }
      // Wait up to 15 s for the page to arrive (a first visit can be slow), then up to 4 s for the element.
      if (!onPage) { if (++waitPage > 150) { go(run.dir); return; } setTimeout(tick, 100); return; }
      if (++tries > 40) {
        // Missing on this page: show its Sample if it has one, otherwise skip silently.
        if (onPage && step.sample) setView({ step: run.i, el: null, sample: true });
        else go(run.dir);
        return;
      }
      setTimeout(tick, 100);
    };
    setView(null);
    setRect(null);
    tick();
  }, [run, router, go]);

  // Keep the cut-out on the element through scrolls and resizes.
  useEffect(() => {
    const el = view?.el;
    if (!el) return;
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setRect(el.getBoundingClientRect())); };
    update();
    const settle = setTimeout(update, reducedMotion() ? 0 : 350);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    // Layout can also shift without a resize event (fonts, images, a viewport change).
    const ro = new ResizeObserver(update);
    ro.observe(el);
    ro.observe(document.documentElement);
    return () => { clearTimeout(settle); cancelAnimationFrame(frame); ro.disconnect(); window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, [view]);

  // Place the card beside the element (below, else above, else centred), inside the window.
  useLayoutEffect(() => {
    if (!view || !card.current) return;
    const c = card.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, gap = 14, m = 16;
    if (!rect) { setPos({ top: Math.max(m, (vh - c.height) / 2), left: Math.max(m, (vw - c.width) / 2) }); return; }
    const clampX = (x: number) => Math.min(Math.max(m, x), vw - c.width - m);
    const clampY = (y: number) => Math.min(Math.max(m, y), vh - c.height - m);
    // Try below, above, right, then left of the element; if none fits, pin to the bottom-right corner.
    if (rect.bottom + gap + c.height <= vh - m) setPos({ top: rect.bottom + gap, left: clampX(rect.left) });
    else if (rect.top - gap - c.height >= m) setPos({ top: rect.top - gap - c.height, left: clampX(rect.left) });
    else if (rect.right + gap + c.width <= vw - m) setPos({ top: clampY(rect.top), left: rect.right + gap });
    else if (rect.left - gap - c.width >= m) setPos({ top: clampY(rect.top), left: rect.left - gap - c.width });
    else setPos({ top: vh - c.height - m, left: vw - c.width - m });
  }, [view, rect]);

  // Focus the card's main button on each step, so keyboard users can carry straight on.
  useEffect(() => {
    if (view) requestAnimationFrame(() => nextBtn.current?.focus({ preventScroll: true }));
  }, [view]);

  // Keyboard: Esc closes, arrows move, Tab stays inside the card.
  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      // Reaching the last card counts as finishing, however it is closed.
      if (e.key === "Escape") { e.preventDefault(); close(view && STEPS[view.step]?.finish ? "completed" : "skipped"); return; }
      if (!view) return;
      if (e.key === "ArrowRight" && !STEPS[view.step]?.finish) { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft" && visibleIndex(view.step, run.ctx) > 0) { e.preventDefault(); go(-1); }
      if (e.key === "Tab" && card.current) {
        const f = [...card.current.querySelectorAll<HTMLElement>("button, a[href], input")].filter((x) => !x.hasAttribute("disabled"));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [run, view, close, go]);

  if (!run || typeof document === "undefined") return null;
  const step = view ? STEPS[view.step] : null;
  const title = step ? (view!.sample && step.sample ? step.sample.title : step.title) : "";
  const body = step ? (view!.sample && step.sample ? step.sample.body : step.body) : "";
  const n = view ? visibleIndex(view.step, run.ctx) + 1 : 0;
  const total = visibleCount(run.ctx);
  const pad = 8;
  const t = reducedMotion() ? "none" : "top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease, opacity 150ms ease";

  return createPortal(
    <>
      {/* Dim overlay with a cut-out; it also stops clicks reaching the page during the tour. */}
      <div className="fixed inset-0 z-[90]" aria-hidden="true">
        {rect ? (
          <div
            style={{
              position: "fixed", top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
              borderRadius: 18, boxShadow: "0 0 0 9999px rgba(12, 10, 18, 0.62)", outline: "2px solid var(--color-signal)", transition: t,
            }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: "rgba(12, 10, 18, 0.62)" }} />
        )}
      </div>
      {step && (
        <div
          ref={card}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cp-tour-title"
          aria-describedby="cp-tour-body"
          className="card fixed z-[91] w-[min(360px,calc(100vw-32px))] rounded-2xl p-4"
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, transition: t, opacity: pos ? 1 : 0 }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="label-xs" aria-live="polite">{step.finish ? "Tour complete" : `${n} of ${total}`}</span>
            {view!.sample && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Sample</span>}
          </div>
          <h2 id="cp-tour-title" className="mt-1.5 text-base font-bold text-slate-900">{title}</h2>
          <p id="cp-tour-body" className="mt-1 text-sm leading-relaxed text-slate-700">{body}</p>
          {!step.finish && (
            <div className="mt-3 flex flex-wrap gap-1" aria-hidden="true">
              {Array.from({ length: total }, (_, k) => (
                <span key={k} className={`h-1.5 rounded-full transition-all ${k + 1 === n ? "w-4 bg-[var(--color-signal)]" : "w-1.5 bg-slate-300"}`} />
              ))}
            </div>
          )}
          {step.finish ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link ref={nextBtn as never} href="/chat" className="btn-dark" onClick={() => close("completed")}>Start a booking</Link>
              <Link href="/upload" className="btn-ghost" onClick={() => close("completed")}>Upload a spreadsheet</Link>
              <button type="button" className="btn-ghost" onClick={() => close("completed")}>Close</button>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-900" onClick={() => close("skipped")}>Skip tour</button>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={n <= 1} onClick={() => go(-1)}>Back</button>
                <button ref={nextBtn} type="button" className="btn-dark px-4 py-1.5 text-sm" onClick={() => go(1)}>Next</button>
              </div>
            </div>
          )}
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            Don&apos;t show again
          </label>
        </div>
      )}
    </>,
    document.body,
  );
}

/** Steps that apply to this run (booking steps only when there's a booking). */
function applicable(ctx: TourContext) {
  return STEPS.map((s, i) => ({ s, i })).filter(({ s }) => !s.when || s.when(ctx));
}
function visibleCount(ctx: TourContext) {
  return applicable(ctx).filter(({ s }) => !s.finish).length;
}
function visibleIndex(i: number, ctx: TourContext) {
  return applicable(ctx).findIndex((x) => x.i === i);
}
