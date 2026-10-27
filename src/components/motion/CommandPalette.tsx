"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SAMPLE_MESSAGES } from "@/lib/samples";
import { startTour } from "../tour/Tour";
import { gsap, reducedMotion } from "./gsap";

type Cmd = { group: string; label: string; hint?: string; run: () => void };

/** ⌘K / Ctrl+K: jump anywhere or start a booking from an example. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const cmds = useMemo<Cmd[]>(() => {
    const go = (href: string) => () => router.push(href);
    return [
      { group: "Go to", label: "Overview", hint: "G O", run: go("/") },
      { group: "Go to", label: "New shipment", hint: "G N", run: go("/chat") },
      { group: "Go to", label: "Upload a workbook", hint: "G U", run: go("/upload") },
      { group: "Go to", label: "Recent audits", hint: "G A", run: go("/audits") },
      { group: "Go to", label: "How CargoPilot decides", run: go("/audits?tab=how-it-decides") },
      ...SAMPLE_MESSAGES.map((s) => ({ group: "Start from an example", label: s.title, hint: s.lane, // Full load so a fresh chat starts even when /chat is already open.
        run: () => window.location.assign(`/chat?q=${encodeURIComponent(s.text)}`) })),
      // The tour opens after the menu closes, so focus can return to the page.
      { group: "Help", label: "Take the tour", hint: "Guided tour", run: () => setTimeout(startTour, 50) },
      { group: "Help", label: "Restart tour", hint: "From the start", run: () => setTimeout(startTour, 50) },
      { group: "Files", label: "Download the sample workbook", run: () => { window.location.href = "/samples/cargopilot-sample-audit.xlsx"; } },
      { group: "Files", label: "Download the blank Case 2 template", run: () => { window.location.href = "/samples/Case2_Shipment_Booking_Test_Data_Format.xlsx"; } },
    ];
  }, [router]);

  const list = cmds.filter((c) => (c.label + " " + c.group + " " + (c.hint ?? "")).toLowerCase().includes(q.trim().toLowerCase()));

  useEffect(() => {
    let g = false;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input,textarea,[contenteditable]");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); return; }
      if (e.key === "Escape") setOpen(false);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      // Two-key shortcuts: G then O / N / U / A.
      if (g) {
        const to = { o: "/", n: "/chat", u: "/upload", a: "/audits" }[e.key.toLowerCase()];
        if (to) router.push(to);
        g = false;
      } else if (e.key.toLowerCase() === "g") { g = true; window.setTimeout(() => (g = false), 900); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cp-palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("cp-palette", onOpen); };
  }, [router]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setSel(0);
    input.current?.focus();
    if (panel.current && !reducedMotion()) gsap.fromTo(panel.current, { y: -12, opacity: 0, scale: 0.98 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: "manifest" });
  }, [open]);

  if (!open) return null;
  const choose = (c: Cmd | undefined) => { if (!c) return; setOpen(false); c.run(); };
  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[rgb(31_26_23/0.45)] px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <div ref={panel} role="dialog" aria-label="Command menu" className="w-full max-w-xl overflow-hidden rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] shadow-2xl shadow-black/30" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-4">
          <span className="font-mono text-xs text-[var(--color-signal)]">⌘K</span>
          <input
            ref={input}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, list.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter") choose(list[sel]);
            }}
            placeholder="Where to? Try “upload” or “Paris”"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-[var(--color-line)] px-1.5 font-mono text-[10px] text-slate-500">ESC</kbd>
        </div>
        <ul className="max-h-[52vh] overflow-y-auto p-1.5">
          {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Nothing matches “{q}”.</li>}
          {list.map((c, i) => {
            const head = c.group !== lastGroup ? (lastGroup = c.group) : null;
            return (
              <li key={c.group + c.label}>
                {head && <div className="label-xs px-3 pb-1 pt-2.5">{head}</div>}
                <button
                  onMouseEnter={() => setSel(i)}
                  onClick={() => choose(c)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left text-sm ${i === sel ? "bg-teal-50 text-slate-900" : "text-slate-700"}`}
                >
                  <span className="truncate">{c.label}</span>
                  {c.hint && <span className={`shrink-0 font-mono text-[10.5px] ${i === sel ? "text-[var(--color-signal)]" : "text-slate-400"}`}>{c.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-between border-t border-[var(--color-line)] px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
          <span>↑↓ move · ↵ open</span>
          <span>G then O / N / U / A to jump</span>
        </div>
      </div>
    </div>
  );
}

/** Opens the palette from a button. */
export const openPalette = () => window.dispatchEvent(new Event("cp-palette"));
