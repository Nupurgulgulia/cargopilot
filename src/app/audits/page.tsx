import Link from "next/link";
import { HowItDecides } from "@/components/HowItDecides";
import { READINESS_META, ReadinessIcon } from "@/components/status";
import { sessionId, sql } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recent audits · CargoPilot" };

const TABS = [
  { key: "recent", label: "Recent audits" },
  { key: "how-it-decides", label: "How it decides" },
] as const;

export default async function AuditsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const active = tab === "how-it-decides" ? "how-it-decides" : "recent";

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Audits</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Recent audits</h1>
          <p className="mt-1 text-[15px] text-slate-600">All the spreadsheets you&apos;ve checked, and how CargoPilot reaches each result.</p>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-slate-200" aria-label="Audit sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "recent" ? "/audits" : `/audits?tab=${t.key}`}
            aria-current={active === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              active === t.key ? "border-[var(--color-signal)] text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {active === "recent" ? <RecentAudits /> : <HowItDecides />}
    </div>
  );
}

async function RecentAudits() {
  const sid = await sessionId();
  const uploads = (await sql`
    SELECT u.id, u.file_name, u.created_at, u.booking_count,
           count(b.id) FILTER (WHERE b.readiness = 'grounded')::int AS grounded,
           count(b.id) FILTER (WHERE b.readiness = 'attention')::int AS attention,
           count(b.id) FILTER (WHERE b.readiness = 'cleared')::int AS cleared
    FROM uploads u LEFT JOIN bookings b ON b.upload_id = u.id
    WHERE u.session_id = ${sid}
    GROUP BY u.id ORDER BY u.created_at DESC LIMIT 50`) as {
    id: string; file_name: string; created_at: string; booking_count: number; grounded: number; attention: number; cleared: number;
  }[];

  if (uploads.length === 0) {
    return (
      <div className="card px-4 py-12 text-center">
        <p className="text-sm text-slate-600">No spreadsheets checked yet.</p>
        <Link href="/upload" className="btn-primary mt-4">Upload a spreadsheet</Link>
      </div>
    );
  }

  return (
    <ul className="card divide-y divide-slate-100">
      {uploads.map((u) => (
        <li key={u.id}>
          <Link href={`/audit/${u.id}`} className="group flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-900 group-hover:text-teal-700">{u.file_name}</div>
              <div className="font-mono text-[11px] uppercase tracking-wide text-slate-500">
                {u.booking_count} bookings · {new Date(u.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })}
              </div>
            </div>
            <div className="flex gap-2 text-xs">
              {(["grounded", "attention", "cleared"] as const).map((r) => (
                <span key={r} title={READINESS_META[r].label} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold ${READINESS_META[r].cls}`}>
                  <ReadinessIcon r={r} className="h-3.5 w-3.5" /> {u[r]} <span className="sr-only">{READINESS_META[r].label}</span>
                </span>
              ))}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
