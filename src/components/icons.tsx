type P = { className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };

export const Logo = ({ className }: P) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <rect x="1" y="1" width="30" height="30" rx="15" fill="var(--accent, #f47b20)" />
    <path d="M8 21.5h9.5" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M8 10.5h16l-4.5 5.5H8" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);
export const Check = ({ className }: P) => (<svg {...base} className={className}><path d="M20 6 9 17l-5-5" /></svg>);
export const Stop = ({ className }: P) => (<svg {...base} className={className}><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></svg>);
export const Warn = ({ className }: P) => (<svg {...base} className={className}><path d="M12 3 2 21h20L12 3Z" /><path d="M12 10v4M12 17.5v.01" /></svg>);
export const Question = ({ className }: P) => (<svg {...base} className={className}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01" /></svg>);
export const Dots = ({ className }: P) => (<svg {...base} className={className}><circle cx="12" cy="12" r="9" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></svg>);
export const Truck = ({ className }: P) => (<svg {...base} className={className}><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></svg>);
export const Chat = ({ className }: P) => (<svg {...base} className={className}><path d="M4 5h16v11H8l-4 4V5Z" /></svg>);
export const Upload = ({ className }: P) => (<svg {...base} className={className}><path d="M12 15V4M7 9l5-5 5 5M4 15v4h16v-4" /></svg>);
export const Download = ({ className }: P) => (<svg {...base} className={className}><path d="M12 4v11M7 10l5 5 5-5M4 19h16" /></svg>);
export const Calc = ({ className }: P) => (<svg {...base} className={className}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" /></svg>);
export const Send = ({ className }: P) => (<svg {...base} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const Plane = ({ className }: P) => (<svg {...base} className={className}><path d="M2 16l20-8-6 13-3-5-5 3 .5-5L2 16Z" /></svg>);
export const External = ({ className }: P) => (<svg {...base} className={className}><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" /></svg>);
export const Info = ({ className }: P) => (<svg {...base} className={className}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>);
export const Sun = ({ className }: P) => (<svg {...base} className={className}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
export const Moon = ({ className }: P) => (<svg {...base} className={className}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></svg>);
