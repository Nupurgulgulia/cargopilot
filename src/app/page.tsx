import Link from "next/link";
import { Calc, Chat, Check, Truck, Upload } from "@/components/icons";
import { ReadinessBadge } from "@/components/status";
import { NumberTicker, Reveal } from "@/components/motion/primitives";
import { RouteMap } from "@/components/motion/RouteMap";
import { TourButton, TourOffer } from "@/components/tour/Tour";
import type { Readiness } from "@/lib/types";
import { sessionId, sql } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview · CargoPilot" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });

const PILLARS = [
  {
    icon: Check,
    title: "Shipment Flight Deck",
    body: "Shows at a glance whether each booking can ship: Grounded, Needs Attention or Cleared for Dispatch. The most serious problems are listed first.",
  },
  {
    icon: Calc,
    title: "Error Detective",
    body: "Explains each problem with the numbers behind it and lets you fix it in one click. Nothing changes unless you approve it.",
  },
  {
    icon: Truck,
    title: "Carrier Matchmaker",
    body: "Picks the best carrier for what matters most to you: price, speed, reliability or a balance of all three. It also shows the next best option.",
  },
];

const STEPS = [
  { no: "1", title: "Describe or upload", body: "Chat in plain English, or drop your Bookings and Items workbook." },
  { no: "2", title: "Check against 10 rules", body: "Each problem comes with its severity, the numbers behind it and a one-click fix." },
  { no: "3", title: "Pick a carrier and confirm", body: "Get the best carrier for your priority, then confirm and email it." },
];

export default async function Dashboard() {
  const sid = await sessionId();
  const [stats] = (await sql`
    SELECT count(*)::int AS total, coalesce(sum(red_count),0)::int AS red, coalesce(sum(amber_count),0)::int AS amber,
           count(*) FILTER (WHERE readiness = 'cleared')::int AS cleared
    FROM bookings WHERE session_id = ${sid}`) as { total: number; red: number; amber: number; cleared: number }[];
  const recent = (await sql`
    SELECT id, source, booking->>'bookingId' AS ref, booking->>'sellerName' AS seller, booking->>'originCity' AS origin,
           booking->>'destinationCity' AS dest, readiness, updated_at
    FROM bookings WHERE session_id = ${sid} ORDER BY updated_at DESC LIMIT 8`) as {
    id: string; source: string; ref: string; seller: string | null; origin: string | null; dest: string | null; readiness: Readiness; updated_at: string;
  }[];
  const uploads = (await sql`
    SELECT id, file_name, booking_count, created_at FROM uploads WHERE session_id = ${sid} ORDER BY created_at DESC LIMIT 5`) as {
    id: string; file_name: string; booking_count: number; created_at: string;
  }[];
  const fresh = stats.total === 0 && uploads.length === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <TourOffer />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div data-tour="overview-title">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Overview</h1>
          <p className="mt-1 text-sm text-slate-700">Pre-flight checks for UK → Germany, France and Netherlands freight.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TourButton />
          <Link href="/upload" className="btn-ghost"><Upload className="h-4 w-4" /> Upload workbook</Link>
          <Link href="/chat" className="btn-dark"><Chat className="h-4 w-4" /> New shipment</Link>
        </div>
      </div>

      {fresh ? (
        <Reveal className="card overflow-hidden">
          <div className="grid lg:grid-cols-[1.1fr_1fr]">
            <div data-reveal className="p-6 sm:p-8">
              <div className="eyebrow">Get started</div>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Check your first booking in under a minute</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                No login needed. Start a conversation or upload a workbook, and CargoPilot shows what&apos;s wrong, how serious it is and how to fix it.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Link href="/chat" className="spotlight group rounded-[10px] border border-[var(--color-line)] bg-[var(--color-raised)] p-4 transition-colors hover:border-teal-500">
                  <Chat className="h-5 w-5 text-teal-700" />
                  <div className="mt-3 text-sm font-semibold text-slate-900">Book in chat</div>
                  <div className="mt-0.5 text-xs text-slate-500">Describe the shipment. It asks only for what&apos;s missing.</div>
                </Link>
                <Link href="/upload" className="spotlight group rounded-[10px] border border-[var(--color-line)] bg-[var(--color-raised)] p-4 transition-colors hover:border-teal-500">
                  <Upload className="h-5 w-5 text-teal-700" />
                  <div className="mt-3 text-sm font-semibold text-slate-900">Audit a workbook</div>
                  <div className="mt-0.5 text-xs text-slate-500">Check every booking at once. A sample file is on the next page.</div>
                </Link>
              </div>
            </div>
            <ol data-reveal className="border-t border-[var(--color-line)] bg-[var(--color-raised)] p-6 sm:p-8 lg:border-l lg:border-t-0">
              {STEPS.map((s) => (
                <li key={s.no} className="flex gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-teal-200 bg-teal-50 text-xs text-teal-700">{s.no}</span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{s.title}</div>
                    <div className="mt-0.5 text-sm text-slate-500">{s.body}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      ) : (
        <>
          <Reveal className="grid grid-cols-2 gap-3 md:grid-cols-4" data-tour="counters">
            <Stat label="Bookings checked" value={stats.total} hint="From chat and uploads" />
            <Stat label="Critical issues" value={stats.red} tone="text-red-700" bar="bg-red-500" hint="Must be fixed before shipping" />
            <Stat label="Warnings" value={stats.amber} tone="text-amber-700" bar="bg-amber-500" hint="Worth checking before shipping" />
            <Stat label="Cleared for dispatch" value={stats.cleared} tone="text-emerald-700" bar="bg-emerald-500" hint="Ready to ship" />
          </Reveal>

          <Reveal className="grid gap-4 lg:grid-cols-3">
            <section data-reveal data-tour="recent-bookings" className="card overflow-hidden lg:col-span-2">
              <Header title="Recent bookings" action={<Link href="/chat" className="text-xs font-semibold text-teal-700 hover:underline">New shipment →</Link>} />
              {recent.length === 0 ? (
                <Empty body="Bookings you start in chat will appear here." />
              ) : (
                <ul>
                  {recent.map((r) => (
                    <li key={r.id} data-tour-booking={r.id} className="border-t border-[var(--color-line)] first:border-t-0">
                      <Link href={r.source === "chat" ? `/chat/${r.id}` : `/booking/${r.id}`} className="group grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 truncate text-sm">
                            <span className="num font-medium text-slate-900">{r.ref}</span>
                            {r.seller && <span className="truncate text-slate-500">{r.seller}</span>}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {r.origin ?? "?"} → {r.dest ?? "?"} · {r.source === "chat" ? "Chat" : "Workbook"} · {when(r.updated_at)}
                          </div>
                        </div>
                        {r.readiness && <ReadinessBadge r={r.readiness} />}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section data-reveal data-tour="recent-audits" className="card overflow-hidden">
              <Header title="Recent audits" action={uploads.length > 0 ? <Link href="/audits" className="text-xs font-semibold text-teal-700 hover:underline">View all →</Link> : undefined} />
              {uploads.length === 0 ? (
                <Empty body="Upload a workbook to check many bookings at once." />
              ) : (
                <ul>
                  {uploads.map((u) => (
                    <li key={u.id} className="border-t border-[var(--color-line)] first:border-t-0">
                      <Link href={`/audit/${u.id}`} className="block px-5 py-3 transition-colors hover:bg-slate-50">
                        <div className="truncate text-sm font-medium text-slate-900">{u.file_name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{u.booking_count} bookings · {when(u.created_at)}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Reveal>
        </>
      )}

      <Reveal scroll className="grid gap-4 md:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.title} data-reveal className="card spotlight rounded-2xl p-5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-700">
              <p.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-base font-bold text-slate-900">{p.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{p.body}</p>
          </div>
        ))}
      </Reveal>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">Lane rates</h2>
          <p className="text-xs text-slate-500">The fixed rate card used for every recommendation. Click a city to compare carriers.</p>
        </div>
        <RouteMap />
      </section>
    </div>
  );
}

function Stat({ label, value, tone = "text-slate-900", bar, hint }: { label: string; value: number; tone?: string; bar?: string; hint?: string }) {
  return (
    <div data-reveal className="card relative overflow-hidden p-4">
      {bar && <span className={`absolute inset-x-0 top-0 h-[2px] ${bar}`} />}
      <div className="label-xs">{label}</div>
      <div className={`mt-2 text-3xl font-bold tracking-tight ${tone}`}><NumberTicker value={value} className="font-sans" /></div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function Header({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3.5">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      {action}
    </div>
  );
}

function Empty({ body }: { body: string }) {
  return <p className="px-5 py-10 text-center text-sm text-slate-500">{body}</p>;
}
