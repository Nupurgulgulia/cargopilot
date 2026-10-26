import Link from "next/link";
import { Calc, Chat, Check, Truck, Upload } from "@/components/icons";
import { ReadinessBadge } from "@/components/status";
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

  return (
    <div>
      <section className="hero-grid bg-navy-900 text-white">
        <div className="mx-auto max-w-7xl px-4 pb-24 pt-14 sm:pt-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
            UK → Germany · France · Netherlands
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[3.4rem]">
            Catch every booking error <span className="text-teal-300">before it ships.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Describe your shipment in plain English, or upload your booking spreadsheet. CargoPilot checks it against 10 rules, explains
            any problem and how to fix it, and suggests the best carrier.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/chat" className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-3 text-sm font-semibold text-navy-950 shadow-lg shadow-teal-500/20 transition hover:bg-teal-400">
              <Chat className="h-4 w-4" /> Start a booking
            </Link>
            <Link href="/upload" className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              <Upload className="h-4 w-4" /> Upload a spreadsheet
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto -mt-12 max-w-7xl space-y-8 px-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Bookings checked" value={stats.total} hint="From chat and uploads" />
          <Stat label="Critical issues" value={stats.red} tone="text-red-700" hint="Must be fixed before shipping" />
          <Stat label="Warnings" value={stats.amber} tone="text-amber-700" hint="Worth checking before shipping" />
          <Stat label="Cleared for dispatch" value={stats.cleared} tone="text-emerald-700" hint="Ready to ship" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="card overflow-hidden lg:col-span-2">
            <Header title="Recent bookings" sub="Your latest shipments" />
            {recent.length === 0 ? (
              <Empty title="No bookings yet" body="Bookings you start in chat or upload in a spreadsheet will appear here." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link href={r.source === "chat" ? `/chat/${r.id}` : `/booking/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-slate-50">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {r.ref} {r.seller && <span className="font-normal text-slate-500">· {r.seller}</span>}
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

          <section className="card overflow-hidden">
            <Header
              title="Recent audits"
              action={uploads.length > 0 ? <Link href="/audits" className="text-xs font-medium text-teal-700 hover:underline">View all →</Link> : undefined}
            />
            {uploads.length === 0 ? (
              <Empty title="No audits yet" body="Upload a spreadsheet to check many bookings at once." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {uploads.map((u) => (
                  <li key={u.id}>
                    <Link href={`/audit/${u.id}`} className="block px-5 py-3.5 transition hover:bg-slate-50">
                      <div className="truncate text-sm font-medium text-slate-900">{u.file_name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{u.booking_count} bookings · {when(u.created_at)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="card p-5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                <p.icon className="h-4.5 w-4.5" />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">{p.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{p.body}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "text-slate-900", hint }: { label: string; value: number; tone?: string; hint?: string }) {
  return (
    <div className="card p-5">
      <div className="label-xs">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${tone}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function Header({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center">
      <div className="text-sm font-medium text-slate-900">{title}</div>
      <p className="mt-1 max-w-xs text-sm text-slate-500">{body}</p>
    </div>
  );
}
