// Design versions: "orange" (Skyline, the default) and "dusk" (violet dashboard). See docs/DESIGN.md.
export const THEMES = [
  { key: "orange", label: "Orange", swatch: "#f47b20" },
  { key: "dusk", label: "Dusk", swatch: "#e46a93" },
] as const;
export type Theme = (typeof THEMES)[number]["key"];

/** Inline script run before first paint: ?theme=… wins, then the saved choice, else Orange. */
export const THEME_BOOT = `try{var q=new URLSearchParams(location.search).get('theme');var t=q||localStorage.getItem('cp-theme');if(t==='dusk'){document.documentElement.dataset.theme='dusk'}if(q)localStorage.setItem('cp-theme',q)}catch(e){}`;
