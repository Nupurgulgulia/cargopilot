"use client";
import { useEffect, useState } from "react";
import type { Theme } from "@/lib/theme";
import { Moon, Sun } from "./icons";

/** Light (the orange Skyline design) or dark (the violet Dusk design), as a sun / moon toggle. */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("orange");
  useEffect(() => setTheme(document.documentElement.dataset.theme === "dusk" ? "dusk" : "orange"), []);

  const dark = theme === "dusk";
  const toggle = () => {
    const next: Theme = dark ? "orange" : "dusk";
    setTheme(next);
    (window as { __cpTheme?: string }).__cpTheme = next;
    if (next === "dusk") document.documentElement.dataset.theme = "dusk";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("cp-theme", next);
    } catch {}
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      onClick={toggle}
      className="relative flex h-9 w-[68px] shrink-0 items-center rounded-full bg-slate-50 p-1 transition-colors hover:bg-slate-100"
    >
      {/* The knob slides under the active icon. */}
      <span className={`absolute top-1 h-7 w-7 rounded-full bg-[var(--color-signal)] shadow-sm transition-transform duration-300 ${dark ? "translate-x-[32px]" : "translate-x-0"}`} />
      <span className={`relative z-10 flex h-7 w-7 items-center justify-center transition-colors ${dark ? "text-slate-500" : "text-white"}`}>
        <Sun className="h-4 w-4" />
      </span>
      <span className={`relative z-10 ml-[4px] flex h-7 w-7 items-center justify-center transition-colors ${dark ? "text-white" : "text-slate-500"}`}>
        <Moon className="h-4 w-4" />
      </span>
    </button>
  );
}
