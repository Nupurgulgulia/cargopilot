import "server-only";
import { carrierLabel } from "../carriers";
import type { BookingView, DataIssue } from "../types";
import { buildView } from "../view";
import { sql, type BookingRow } from "./db";

export interface UploadRowSummary {
  id: string;
  bookingRef: string | null;
  seller: string | null;
  route: string;
  priority: string | null;
  readiness: BookingView["readiness"];
  red: number;
  amber: number;
  review: number;
  failedRules: { ruleId: string; severity: string }[];
  carrier: string | null;
  carrierCost: number | null;
  headline: string;
  dataIssues: number;
}

export function summarise(row: Pick<BookingRow, "id" | "booking" | "items">): UploadRowSummary & { view: BookingView } {
  const view = buildView(row.booking, row.items);
  const b = row.booking;
  const rec = view.carriers.selected && view.carriers.selected.eligible !== false ? view.carriers.selected : view.carriers.recommended;
  const failed = new Map<string, string>();
  // A hard failure outranks "please confirm" when one rule has several item results.
  for (const r of view.results) {
    if (r.status === "fail") failed.set(r.ruleId, r.severity);
    else if (r.status === "review" && !failed.has(r.ruleId)) failed.set(r.ruleId, "Review");
  }
  return {
    id: row.id,
    bookingRef: b.bookingId,
    seller: b.sellerName,
    route: `${b.originCity ?? "?"} → ${b.destinationCity ?? "?"}${b.destinationCountry ? `, ${b.destinationCountry}` : ""}`,
    priority: b.sellerPriority,
    readiness: view.readiness,
    red: view.summary.red,
    amber: view.summary.amber,
    review: view.summary.review,
    failedRules: [...failed].map(([ruleId, severity]) => ({ ruleId, severity })),
    carrier: rec ? carrierLabel(rec.carrier) : null,
    carrierCost: rec?.totalCost ?? null,
    headline: view.summary.headline,
    dataIssues: view.dataIssues.filter((d) => d.level === "error").length,
    view,
  };
}

export async function loadUpload(sid: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const up = await sql`SELECT * FROM uploads WHERE id = ${id} AND session_id = ${sid}`;
  if (!up[0]) return null;
  const rows = (await sql`SELECT id, booking, items FROM bookings WHERE upload_id = ${id} ORDER BY (booking->>'sourceRow')::int NULLS LAST, created_at`) as BookingRow[];
  const bookings = rows.map((r) => {
    const s: Partial<ReturnType<typeof summarise>> = summarise(r);
    delete s.view;
    return s as UploadRowSummary;
  });
  return {
    id,
    fileName: up[0].file_name as string,
    createdAt: up[0].created_at as string,
    importIssues: up[0].import_issues as (DataIssue | { level: "info"; message: string })[],
    bookings,
  };
}
