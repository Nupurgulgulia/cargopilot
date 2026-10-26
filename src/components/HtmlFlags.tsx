"use client";
import { useLayoutEffect } from "react";

// On some pages React re-creates <html> in the browser after load, which drops the attributes the
// pre-paint script set (dark mode, motion). Put them back as soon as that happens, before paint.
export function HtmlFlags() {
  useLayoutEffect(() => {
    const el = document.documentElement;
    const apply = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("cp-theme");
      } catch {}
      const theme = (window as { __cpTheme?: string }).__cpTheme ?? saved;
      const dark = theme === "dusk" || theme === "dark";
      if (dark && el.dataset.theme !== "dusk") el.dataset.theme = "dusk";
      else if (!dark && el.dataset.theme) delete el.dataset.theme;
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches && !el.classList.contains("js-motion")) el.classList.add("js-motion");
    };
    apply();
    const watch = new MutationObserver(apply);
    watch.observe(el, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => watch.disconnect();
  }, []);
  return null;
}
