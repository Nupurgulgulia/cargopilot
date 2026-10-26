"use client";
import { useEffect, useState } from "react";
import { THEMES, type Theme } from "@/lib/theme";

export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("orange");
  useEffect(() => setTheme(document.documentElement.dataset.theme === "dusk" ? "dusk" : "orange"), []);

  const pick = (t: Theme) => {
    setTheme(t);
    if (t === "dusk") document.documentElement.dataset.theme = "dusk";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("cp-theme", t);
    } catch {}
  };

  return (
    <div role="radiogroup" aria-label="Design version" className="flex shrink-0 items-center gap-0.5 rounded-full bg-slate-50 p-1">
      {THEMES.map((t) => (
        <button
          key={t.key}
          role="radio"
          aria-checked={theme === t.key}
          onClick={() => pick(t.key)}
          title={`${t.label} design`}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${theme === t.key ? "bg-slate-200 text-slate-900" : "text-slate-500 hover:text-slate-800"}`}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.swatch }} />
          <span className="hidden md:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
