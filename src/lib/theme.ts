// Two looks: light mode ("orange", the Skyline design, default) and dark mode ("dusk"). See docs/DESIGN.md.
export type Theme = "orange" | "dusk";

/** Inline script run before first paint: ?theme=… wins, then the saved choice, else light mode. */
export const THEME_BOOT = `try{var q=new URLSearchParams(location.search).get('theme');var t=q||localStorage.getItem('cp-theme');if(t==='dusk'||t==='dark'){document.documentElement.dataset.theme='dusk'}if(q)localStorage.setItem('cp-theme',q==='dark'?'dusk':q==='light'?'orange':q)}catch(e){}`;
