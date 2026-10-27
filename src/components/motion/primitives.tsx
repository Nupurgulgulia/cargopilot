"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap, reducedMotion, ScrollTrigger, SplitText, useGSAP } from "./gsap";

/** Blur-fade entrance for every [data-reveal] child, staggered; optionally when scrolled into view. */
export function Reveal({ children, className, scroll = false, stagger = 0.06, delay = 0 }: { children: ReactNode; className?: string; scroll?: boolean; stagger?: number; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const items = ref.current?.querySelectorAll<HTMLElement>("[data-reveal]");
      if (!items?.length) return;
      if (reducedMotion()) return void gsap.set(items, { opacity: 1 });
      gsap.fromTo(
        items,
        { opacity: 0, y: 14, filter: "blur(6px)" },
        {
          opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "manifest", stagger, delay,
          clearProps: "filter,transform",
          scrollTrigger: scroll ? { trigger: ref.current, start: "top 85%", once: true } : undefined,
        },
      );
    },
    { scope: ref },
  );
  return <div ref={ref} className={className}>{children}</div>;
}

/** Headline whose words rise and un-blur one by one (GSAP SplitText). */
export function SplitHeadline({ children, className, as: Tag = "h1" }: { children: ReactNode; className?: string; as?: "h1" | "h2" }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useGSAP(
    () => {
      if (!ref.current || reducedMotion()) return;
      const split = SplitText.create(ref.current, { type: "words" });
      gsap.from(split.words, { yPercent: 45, opacity: 0, filter: "blur(8px)", duration: 0.9, ease: "manifest", stagger: 0.045, clearProps: "filter" });
      return () => split.revert();
    },
    { scope: ref },
  );
  return <Tag ref={ref} className={className}>{children}</Tag>;
}

/** Counts up to a number when it first appears, and re-animates when it changes. */
export function NumberTicker({ value, className, decimals = 0 }: { value: number; className?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (reducedMotion()) {
      el.textContent = fmt(value);
      last.current = value;
      return;
    }
    const obj = { n: last.current };
    const tw = gsap.to(obj, {
      n: value, duration: 1.1, ease: "power3.out",
      onUpdate: () => { el.textContent = fmt(obj.n); },
      scrollTrigger: { trigger: el, start: "top 95%", once: true },
    });
    last.current = value;
    return () => { tw.kill(); };
  }, [value, decimals]);
  return <span ref={ref} className={`tabular-nums ${className ?? "font-mono"}`}>0</span>;
}

/** Departure-board text: scrambles into the new value whenever it changes. */
export function DepartureBoard({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      el.textContent = text;
      return;
    }
    const tw = gsap.to(el, {
      duration: first.current ? 0.9 : 1.1,
      scrambleText: { text, chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ·→", revealDelay: 0.25, speed: 0.6 },
      ease: "none",
    });
    first.current = false;
    return () => { tw.kill(); };
  }, [text]);
  return <span ref={ref} className={className} aria-label={text}>{text}</span>;
}

/** Wraps a button/link so it leans gently toward the cursor. */
export function Magnetic({ children, strength = 0.25 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(() => {
    const el = ref.current;
    if (!el || reducedMotion() || window.matchMedia("(pointer: coarse)").matches) return;
    const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * strength);
      yTo((e.clientY - (r.top + r.height / 2)) * strength);
    };
    const leave = () => { xTo(0); yTo(0); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); };
  });
  return <span ref={ref} className="inline-block will-change-transform">{children}</span>;
}

/** One listener for the whole app: moves the spotlight on any .spotlight element under the cursor. */
export function SpotlightTracker() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".spotlight");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  // Keep ScrollTrigger in sync after client navigations change the page height.
  useEffect(() => {
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 400);
    return () => window.clearTimeout(id);
  });
  return null;
}

/** Smoothly animated presence: renders children only on the client after mount (avoids hydration flashes). */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
