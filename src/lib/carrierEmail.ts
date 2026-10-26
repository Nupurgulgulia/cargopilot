// The booking request emailed to the carrier. Built only from checked booking data,
// so the sender can't turn it into arbitrary content (only a short note is free text).
import { carrierLabel } from "./carriers";
import { addDaysISO, gbp0, isoToDisplay, kg, num, plural } from "./format";
import type { BookingView } from "./types";

export interface CarrierEmail {
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function chosenCarrier(view: BookingView) {
  const rec = view.carriers;
  return rec.selected && rec.selected.eligible !== false ? rec.selected : rec.recommended;
}

export function buildCarrierEmail(view: BookingView, opts: { replyTo: string; note?: string }): CarrierEmail {
  const b = view.booking;
  const c = chosenCarrier(view);
  const route = `${b.originCity ?? "?"}, United Kingdom → ${b.destinationCity ?? "?"}, ${b.destinationCountry ?? "?"}`;
  const service = c ? carrierLabel(c.carrier) : "your road freight service";
  const wpp = b.grossWeightKg != null && b.pallets ? b.grossWeightKg / b.pallets : null;

  const subject = `Booking request ${b.bookingId ?? ""}: ${b.originCity ?? "?"} to ${b.destinationCity ?? "?"}, ${plural(b.pallets ?? 0, "pallet")}, collection ${isoToDisplay(b.readyToShipDate)}`.replace(/\s+/g, " ");

  const details: [string, string][] = [
    ["Booking reference", b.bookingId ?? "Not set"],
    ["Shipper", b.sellerName ?? "Not set"],
    ["Service requested", service],
    ["Route", route],
    ["Delivery to", `${b.destinationType ?? "Not set"}${b.destinationType === "Warehouse" ? (b.deliveryAppointmentBooked ? " (delivery appointment booked)" : " (delivery appointment not booked yet)") : ""}`],
    ["Ready for collection", isoToDisplay(b.readyToShipDate)],
    ["Pallets", b.pallets != null ? num(b.pallets) : "Not set"],
    ["Cartons", b.cartons != null ? num(b.cartons) : "Not set"],
    ["Gross weight", b.grossWeightKg != null ? `${kg(b.grossWeightKg)}${wpp != null ? ` (${kg(Math.round(wpp * 10) / 10)} per pallet)` : ""}` : "Not set"],
    ["Declared value", b.declaredValue != null ? gbp0(b.declaredValue) : "Not set"],
  ];
  if (c) {
    details.push(["Quoted rate", `${gbp0(c.carrier.pricePerPallet)} per pallet${c.totalCost != null ? `, ${gbp0(c.totalCost)} in total` : ""}`]);
    if (b.readyToShipDate) details.push(["Expected delivery", `${isoToDisplay(addDaysISO(b.readyToShipDate, c.carrier.transitDays))} (${plural(c.carrier.transitDays, "day")} transit)`]);
  }

  const goods = view.items.map((it) => ({
    description: it.description ?? it.sku ?? "Item",
    sku: it.sku ?? "",
    qty: it.quantity != null ? num(it.quantity) : "?",
    cartons: it.cartons != null ? num(it.cartons) : "?",
    hs: it.hsCode ?? "Not set",
    origin: it.countryOfOrigin ?? "Not set",
  }));

  const note = opts.note?.trim();
  const sign = b.sellerName ?? "The shipper";

  const text = [
    "Hello,",
    "",
    `Please book the following shipment with ${service} and confirm the collection slot and price.`,
    "",
    ...details.map(([k, v]) => `${k}: ${v}`),
    "",
    "Goods:",
    ...goods.map((g) => `- ${g.qty} x ${g.description}${g.sku ? ` (${g.sku})` : ""}, ${g.cartons} cartons, HS ${g.hs}, made in ${g.origin}`),
    ...(note ? ["", `Note from the shipper: ${note}`] : []),
    "",
    `Please reply to ${opts.replyTo} to confirm.`,
    "",
    "Thank you,",
    sign,
    "",
    "Sent via CargoPilot. All details were checked against the booking rulebook before sending.",
  ].join("\n");

  const td = "padding:6px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top;";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;line-height:1.5">
<p>Hello,</p>
<p>Please book the following shipment with <b>${esc(service)}</b> and confirm the collection slot and price.</p>
<table style="border-collapse:collapse;margin:12px 0">${details
    .map(([k, v]) => `<tr><td style="${td}color:#64748b">${esc(k)}</td><td style="${td}font-weight:600">${esc(v)}</td></tr>`)
    .join("")}</table>
<p style="margin-bottom:4px"><b>Goods</b></p>
<table style="border-collapse:collapse;margin:0 0 12px">
<tr style="background:#f1f5f9"><th style="${td}text-align:left">Item</th><th style="${td}text-align:right">Units</th><th style="${td}text-align:right">Cartons</th><th style="${td}text-align:left">HS code</th><th style="${td}text-align:left">Origin</th></tr>
${goods
  .map(
    (g) =>
      `<tr><td style="${td}">${esc(g.description)}${g.sku ? ` <span style="color:#64748b">(${esc(g.sku)})</span>` : ""}</td><td style="${td}text-align:right">${esc(g.qty)}</td><td style="${td}text-align:right">${esc(g.cartons)}</td><td style="${td}">${esc(g.hs)}</td><td style="${td}">${esc(g.origin)}</td></tr>`,
  )
  .join("")}
</table>
${note ? `<p><b>Note from the shipper:</b> ${esc(note)}</p>` : ""}
<p>Please reply to <a href="mailto:${esc(opts.replyTo)}">${esc(opts.replyTo)}</a> to confirm.</p>
<p>Thank you,<br>${esc(sign)}</p>
<p style="color:#94a3b8;font-size:12px">Sent via CargoPilot. All details were checked against the booking rulebook before sending.</p>
</div>`;

  return { subject, text, html };
}
