"use client";
import { useMemo, useRef, useState } from "react";
import { CARRIERS, DESTINATIONS, ORIGIN_CITIES } from "@/lib/constants";
import { gsap, reducedMotion, useGSAP } from "./gsap";

// Rough lon/lat for the cities in the case rate card.
const CITY: Record<string, [number, number]> = {
  London: [-0.13, 51.51], Manchester: [-2.24, 53.48], Birmingham: [-1.89, 52.49], Leeds: [-1.55, 53.8],
  Berlin: [13.4, 52.52], Frankfurt: [8.68, 50.11], Hamburg: [9.99, 53.55],
  Paris: [2.35, 48.86], Lyon: [4.84, 45.76], Amsterdam: [4.9, 52.37], Rotterdam: [4.48, 51.92],
};
// Coarse coastlines, only used to decide where the background dots go.
const GB = [[-5.7, 50.1], [-3, 50.6], [1.4, 51.2], [1.7, 52.6], [0.3, 53.4], [-0.1, 54.5], [-1.6, 55.6], [-2, 57.6], [-5, 58.6], [-6.2, 56.5], [-5, 55], [-3, 54.4], [-3.3, 53.4], [-4.6, 53.3], [-4.2, 52.3], [-5.2, 51.7], [-3, 51.4]];
const EU = [[-1.8, 43.4], [-1.2, 46.2], [-2.5, 47.3], [-4.7, 48.4], [-1.6, 48.7], [0.2, 49.7], [1.6, 50.9], [3.2, 51.4], [4, 51.9], [4.7, 52.9], [6.9, 53.5], [8.6, 53.9], [8.9, 54.9], [8.3, 55.6], [10, 55], [10.9, 54], [14.2, 53.9], [16, 54.5], [18, 54.8], [18, 43], [-1.8, 43]];

const W = 600, H = 420;
const px = ([lon, lat]: number[]) => [(lon + 4.2) * 30, (55.4 - lat) * 40] as const;
const inside = (p: number[], poly: number[][]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const arc = (a: string, b: string) => {
  const [x1, y1] = px(CITY[a]), [x2, y2] = px(CITY[b]);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.22;
  return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
};
const COUNTRY_OF = Object.fromEntries(Object.entries(DESTINATIONS).flatMap(([c, cities]) => cities.map((x) => [x, c])));
const DEST_CITIES = Object.values(DESTINATIONS).flat();

/** Interactive UK → EU lane map: pick an origin and a destination to see that lane's carriers. */
export function RouteMap({ className }: { className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState("London");
  const [dest, setDest] = useState("Berlin");
  const [touched, setTouched] = useState(false);

  const dots = useMemo(() => {
    const out: [number, number][] = [];
    for (let lat = 43.2; lat <= 56; lat += 0.33)
      for (let lon = -6; lon <= 17; lon += 0.42) if (inside([lon, lat], GB) || inside([lon, lat], EU)) out.push(px([lon, lat]) as [number, number]);
    return out;
  }, []);

  const country = COUNTRY_OF[dest];
  const lane = CARRIERS.filter((c) => c.destinationCountry === country);
  const cheapest = Math.min(...lane.map((c) => c.pricePerPallet));

  // Idle demo: cycle destinations until the visitor picks one.
  useGSAP(
    () => {
      if (touched || reducedMotion()) return;
      const id = window.setInterval(() => {
        setDest((d) => DEST_CITIES[(DEST_CITIES.indexOf(d) + 1) % DEST_CITIES.length]);
        setOrigin((o) => (Math.random() < 0.35 ? ORIGIN_CITIES[Math.floor(Math.random() * ORIGIN_CITIES.length)] : o));
      }, 3800);
      return () => window.clearInterval(id);
    },
    { dependencies: [touched] },
  );

  // Draw the active lane, then run a truck along it.
  useGSAP(
    () => {
      if (reducedMotion()) return;
      const tl = gsap.timeline();
      tl.fromTo("[data-lane-active]", { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.9, ease: "manifest" })
        .fromTo("[data-lane-label]", { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.4 }, "-=0.3")
        .fromTo("[data-carrier-row]", { opacity: 0, x: 10 }, { opacity: 1, x: 0, stagger: 0.07, duration: 0.45, ease: "manifest" }, 0.1)
        .fromTo("[data-bar]", { scaleX: 0 }, { scaleX: 1, transformOrigin: "left", stagger: 0.07, duration: 0.7, ease: "manifest" }, 0.2);
      gsap.to("[data-truck]", {
        motionPath: { path: "[data-lane-active]", align: "[data-lane-active]", alignOrigin: [0.5, 0.5], autoRotate: true },
        duration: 2.6, ease: "power1.inOut", repeat: -1, repeatDelay: 0.4, delay: 0.5,
      });
    },
    { scope: root, dependencies: [origin, dest], revertOnUpdate: true },
  );

  const pick = (fn: () => void) => { setTouched(true); fn(); };
  const [ox, oy] = px(CITY[origin]);
  const [dx, dy] = px(CITY[dest]);
  // Quadratic midpoint of the active arc, so the lane tag sits just above it.
  const labelY = (oy + dy) / 4 + ((oy + dy) / 2 - Math.hypot(dx - ox, dy - oy) * 0.22) / 2;

  return (
    <div ref={root} className={`grid gap-0 overflow-hidden rounded-[12px] border border-[var(--color-line)] bg-[var(--color-card)] md:grid-cols-[1fr_250px] ${className ?? ""}`}>
      <div className="relative border-b border-[var(--color-line)] md:border-b-0 md:border-r">
        <div className="absolute bottom-3 left-4 z-10 flex items-center gap-2 label-xs">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--color-signal)] text-[var(--color-signal)]" />
          Lane explorer · click any city
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto max-h-[340px] w-full select-none" role="img" aria-label={`Lane from ${origin} to ${dest}`}>
          {dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.6} fill="var(--n-300)" />)}
          {/* faint network */}
          {DEST_CITIES.map((d) => <path key={d} d={arc(origin, d)} fill="none" stroke="var(--n-300)" strokeWidth={1} strokeDasharray="2 4" />)}
          <path d={arc(origin, dest)} fill="none" stroke="var(--a-100)" strokeWidth={6} strokeLinecap="round" />
          <path data-lane-active d={arc(origin, dest)} fill="none" stroke="var(--color-signal)" strokeWidth={2} strokeLinecap="round" />
          <g data-truck>
            <rect x={-7} y={-4} width={14} height={8} rx={2} fill="var(--n-900)" />
            <rect x={3} y={-3} width={3} height={6} rx={1} fill="var(--color-signal)" />
          </g>
          {Object.keys(CITY).map((c) => {
            const [x, y] = px(CITY[c]);
            const isOrigin = ORIGIN_CITIES.includes(c);
            const active = c === origin || c === dest;
            return (
              <g
                key={c}
                className="cursor-pointer"
                onClick={() => pick(() => (isOrigin ? setOrigin(c) : setDest(c)))}
                role="button"
                tabIndex={0}
                aria-label={isOrigin ? `Ship from ${c}` : `Ship to ${c}`}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") pick(() => (isOrigin ? setOrigin(c) : setDest(c))); }}
              >
                <circle cx={x} cy={y} r={14} fill="transparent" />
                {active && <circle cx={x} cy={y} r={9} fill="var(--a-100)" />}
                <circle cx={x} cy={y} r={active ? 4.5 : 3.2} fill={active ? "var(--color-signal)" : isOrigin ? "var(--n-700)" : "var(--color-card)"} stroke="var(--n-600)" strokeWidth={1.3} />
                <text x={x + 8} y={y + 3.5} className="font-mono" fontSize={10.5} fill={active ? "var(--n-900)" : "var(--n-500)"} fontWeight={active ? 600 : 400}>
                  {c.toUpperCase()}
                </text>
              </g>
            );
          })}
          <g transform={`translate(${Math.min(W - 160, Math.max(8, (ox + dx) / 2 - 76))}, ${Math.max(36, labelY - 34)})`}>
            <g data-lane-label>
              <rect width={152} height={22} rx={11} fill="var(--color-signal)" />
              <text x={76} y={14.5} textAnchor="middle" className="font-mono" fontSize={10} fill="var(--color-on-signal)">
                {origin.slice(0, 3).toUpperCase()} → {dest.slice(0, 3).toUpperCase()} · {lane.length} CARRIERS
              </text>
            </g>
          </g>
        </svg>
      </div>
      <div className="flex flex-col p-4">
        <div className="label-xs">Rate card · {country}</div>
        <div className="mt-1 text-lg font-bold text-slate-900">{origin} → {dest}</div>
        <ul className="mt-4 space-y-3">
          {lane.map((c) => (
            <li key={c.id} data-carrier-row>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold text-slate-900">{c.carrier}</span>
                <span className="num text-slate-900">£{c.pricePerPallet}<span className="text-slate-500">/plt</span></span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200">
                <div data-bar className={`h-full ${c.pricePerPallet === cheapest ? "bg-[var(--color-signal)]" : "bg-slate-500"}`} style={{ width: `${(cheapest / c.pricePerPallet) * 100}%` }} />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10.5px] text-slate-500">
                <span>{c.service.toUpperCase()}</span>
                <span>{c.transitDays}D · {c.onTimeRate}% ON TIME</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-auto pt-4 text-xs leading-relaxed text-slate-500">Bar length shows value for money. CargoPilot ranks these for your priority once your booking is in.</p>
      </div>
    </div>
  );
}
