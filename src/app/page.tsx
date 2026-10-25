import Link from "next/link";
import { Chat, Download, Upload } from "@/components/icons";
import { ReadinessBadge } from "@/components/status";
import type { Readiness } from "@/lib/types";
import { sessionId, sql } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const sid = await sessionId();
  const [stats] = (await sql`
    SELECT count(*)::int AS total, coalesce(sum(red_count),0)::int AS red, coalesce(sum(amber_count),0)::int AS amber,
           count(*) FILTER (WHERE readiness <> 'cleared')::int AS needs
    FROM bookings WHERE session_id = ${sid}`) as { total: number; red: number; amber: number; needs: number }[];
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
      <section className="bg-navy-900 text-white">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-10">
          <p className="text-sm font-medium text-teal-300">UK → Germany · France · Netherlands</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Book a shipment in plain language. Catch the mistakes before it leaves.
          </h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            CargoPilot collects your booking by chat or reads your workbook, runs the 10 pre-flight checks, shows the working behind every error,
            and recommends a carrier for your priority.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:max-w-3xl">
            <Link href="/chat" className="group rounded-xl bg-teal-600 p-5 transition hover:bg-teal-500">
              <Chat className="h-6 w-6" />
              <div className="mt-2 text-lg font-semibold">New shipment</div>
              <div className="text-sm text-teal-50/90">Describe it in your own words — I&apos;ll ask only for what&apos;s missing.</div>
            </Link>
            <Link href="/upload" className="rounded-xl bg-white/10 p-5 transition hover:bg-white/15">
              <Upload className="h-6 w-6" />
              <div className="mt-2 text-lg font-semibold">Upload workbook</div>
              <div className="text-sm text-slate-300">Audit every booking and item row in the Case 2 format.</div>
            </Link>
          </div>
          <a href="/samples/cargopilot-sample-audit.xlsx" className="mt-4 inline-flex items-center gap-1.5 text-sm text-teal-300 hover:underline">
            <Download className="h-4 w-4" /> Sample workbook with planted errors
          </a>
        </div>
      </section>

      <div className="mx-auto -mt-8 max-w-7xl space-y-6 px-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Bookings checked" value={stats.total} />
          <Stat label="Red issues" value={stats.red} tone="text-red-700" />
          <Stat label="Amber warnings" value={stats.amber} tone="text-amber-700" />
          <Stat label="Need correction" value={stats.needs} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="card lg:col-span-2">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">Recent bookings</h2>
            {recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No bookings yet. Start a shipment or upload a workbook — results appear here.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link href={r.source === "chat" ? `/chat/${r.id}` : `/booking/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{r.ref} {r.seller && <span className="font-normal text-slate-500">· {r.seller}</span>}</div>
                        <div className="text-xs text-slate-500">{r.origin ?? "?"} → {r.dest ?? "?"} · {r.source === "chat" ? "chat" : "upload"} · {new Date(r.updated_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</div>
                      </div>
                      {r.readiness && <ReadinessBadge r={r.readiness} />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">Recent audits</h2>
            {uploads.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No workbooks uploaded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {uploads.map((u) => (
                  <li key={u.id}>
                    <Link href={`/audit/${u.id}`} className="block px-4 py-3 hover:bg-slate-50">
                      <div className="truncate text-sm font-medium text-slate-900">{u.file_name}</div>
                      <div className="text-xs text-slate-500">{u.booking_count} bookings · {new Date(u.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "text-slate-900" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="card p-4">
      <div className="label-xs">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
