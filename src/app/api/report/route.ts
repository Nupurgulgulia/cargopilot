import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { carrierLabel } from "@/lib/carriers";
import { isoToDisplay } from "@/lib/format";
import type { BookingView } from "@/lib/types";
import { buildView } from "@/lib/view";
import { getBooking, sql, type BookingRow } from "@/lib/server/db";

const READINESS = { grounded: "Grounded — dispatch blocked", attention: "Needs attention", cleared: "Cleared for dispatch review" };
const STATUS = { pass: "Passed", fail: "Failed", review: "Needs confirmation", not_evaluable: "Not checked — data missing" };

function issueRows(view: BookingView) {
  return view.results
    .filter((r) => r.status !== "pass")
    .map((r) => ({
      "Booking ID": view.booking.bookingId,
      Rule: r.ruleId,
      Check: r.title,
      Severity: r.severity,
      Status: STATUS[r.status] + (r.keptReason ? " (kept by seller)" : ""),
      Item: r.itemLabel ?? "",
      "What's wrong": r.explanation,
      Calculation: r.calculation ?? "",
      "Found": r.observed ?? "",
      "Expected": r.expected ?? "",
      "Suggested fix": r.suggestions.map((s) => s.label).join(" / "),
      "Seller's reason": r.keptReason ?? "",
    }));
}

function summaryRow(view: BookingView) {
  const b = view.booking;
  const rec = view.carriers.selected && view.carriers.selected.eligible !== false ? view.carriers.selected : view.carriers.recommended;
  return {
    "Booking ID": b.bookingId,
    Seller: b.sellerName,
    Route: `${b.originCity ?? "?"} → ${b.destinationCity ?? "?"}, ${b.destinationCountry ?? "?"}`,
    "Ready to ship": isoToDisplay(b.readyToShipDate),
    Priority: b.sellerPriority,
    Status: READINESS[view.readiness],
    "Checks": view.summary.headline,
    "Red issues": view.summary.red,
    "Amber warnings": view.summary.amber,
    "Recommended carrier": rec ? carrierLabel(rec.carrier) : view.carriers.unavailableReason ?? "",
    "Est. cost (GBP)": rec?.totalCost ?? "",
    "Transit (days)": rec?.carrier.transitDays ?? "",
    "Why": view.carriers.reason,
    "Runner-up": view.carriers.tradeOff ?? "",
    "Data issues": view.dataIssues.map((d) => d.message).join(" | "),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  let rows: BookingRow[] = [];
  let name = "cargopilot-report";
  const bookingId = url.searchParams.get("booking");
  const uploadId = url.searchParams.get("upload");
  if (bookingId) {
    const r = await getBooking(bookingId);
    if (r) rows = [r];
    name = `cargopilot-${r?.booking.bookingId ?? "booking"}`;
  } else if (uploadId && /^[0-9a-f-]{36}$/i.test(uploadId)) {
    rows = (await sql`SELECT * FROM bookings WHERE upload_id = ${uploadId} ORDER BY (booking->>'sourceRow')::int NULLS LAST`) as BookingRow[];
    name = "cargopilot-audit";
  }
  if (rows.length === 0) return NextResponse.json({ error: "Nothing to report." }, { status: 404 });

  const views = rows.map((r) => buildView(r.booking, r.items));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(views.map(summaryRow)), "Summary");
  const issues = views.flatMap(issueRows);
  XLSX.utils.book_append_sheet(
    wb,
    issues.length ? XLSX.utils.json_to_sheet(issues) : XLSX.utils.aoa_to_sheet([["No rulebook issues detected."]]),
    "Issues",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["CargoPilot pre-flight audit — generated " + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"],
      ["This is a data check against the Case 2 rulebook. It is not a customs clearance or a carrier booking."],
      ["The uploaded workbook was not modified; corrections are listed with original values in the app's change history."],
    ]),
    "About",
  );
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
    },
  });
}
