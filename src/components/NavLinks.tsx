"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { gsap, reducedMotion } from "./motion/gsap";
import { openPalette } from "./motion/CommandPalette";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/chat", label: "New shipment" },
  { href: "/upload", label: "Upload audit" },
  { href: "/audits", label: "Recent audits" },
];

export function NavLinks() {
  const path = usePathname();
  const nav = useRef<HTMLElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  // An individual audit (/audit/…) belongs under "Recent audits".
  const isActive = (href: string) => (href === "/" ? path === "/" : href === "/audits" ? path.startsWith("/audit") : path.startsWith(href));

  // Slide the underline to the active (or hovered) link.
  const moveTo = (el: HTMLElement | null | undefined, instant = false) => {
    if (!pill.current) return;
    if (!el) return void gsap.to(pill.current, { opacity: 0, duration: 0.2 });
    const vars = { x: el.offsetLeft, width: el.offsetWidth, opacity: 1 };
    if (instant || reducedMotion()) gsap.set(pill.current, vars);
    else gsap.to(pill.current, { ...vars, duration: 0.45, ease: "manifest" });
  };
  const active = () => nav.current?.querySelector<HTMLElement>("[aria-current=page]");
  useLayoutEffect(() => moveTo(active(), !pill.current?.style.width), [path]);

  return (
    <>
      <nav ref={nav} className="relative flex flex-1 items-stretch gap-0.5 self-stretch overflow-x-auto overflow-y-hidden text-[13px] [scrollbar-width:none]" onMouseLeave={() => moveTo(active())}>
        <span ref={pill} className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-[var(--color-signal)] opacity-0" />
        {LINKS.map((l) => {
          const on = isActive(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              onMouseEnter={(e) => moveTo(e.currentTarget)}
              aria-current={on ? "page" : undefined}
              className={`relative z-10 flex items-center whitespace-nowrap rounded-full px-4 font-medium transition-colors ${on ? "text-white" : "text-slate-600 hover:text-white"}`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <button onClick={openPalette} className="hidden items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs text-slate-600 transition hover:text-slate-900 sm:inline-flex" aria-label="Open command menu">
        Jump to…
        <kbd className="rounded-full bg-slate-200 px-1.5 font-mono text-[10px] text-slate-700">⌘K</kbd>
      </button>
    </>
  );
}
