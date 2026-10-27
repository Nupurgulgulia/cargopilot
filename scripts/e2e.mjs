// End-to-end check of CargoPilot against a running server (default http://localhost:3000).
// Drives the real API the pages use: pages, chat, past-date rejection, workbook upload, Error Detective,
// confirmation, commercial invoice approval, compliance report, cargo labels and the carrier email preview.
// It creates test bookings (sample data only) and never sends an email: the only email POST is an invalid one.
//
//   node scripts/e2e.mjs [baseUrl]
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const { PDFDocument } = require("pdf-lib");

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "e2e-output");
fs.mkdirSync(OUT, { recursive: true });
const results = [];
let section = "";
let cookie = "";

const ok = (name, pass, detail = "") => {
  results.push({ section, name, pass: Boolean(pass), detail });
  console.log(`${pass ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const begin = (s) => { section = s; console.log(`\n${s}`); };

async function call(p, { method = "GET", json, raw = false } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { ...(json ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: json ? JSON.stringify(json) : undefined,
    redirect: "manual",
  });
  const set = res.headers.get("set-cookie");
  if (set && /cp_sid=/.test(set)) cookie = set.match(/cp_sid=[^;]+/)[0];
  if (raw) return { res, bytes: new Uint8Array(await res.arrayBuffer()) };
  const text = await res.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  return { res, body };
}
const act = (id, json) => call(`/api/bookings/${id}/actions`, { method: "POST", json });
async function pdfInfo(bytes) {
  const isPdf = new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (!isPdf) return { isPdf, pages: 0 };
  const doc = await PDFDocument.load(bytes);
  const { width, height } = doc.getPage(0).getSize();
  return { isPdf, pages: doc.getPageCount(), w: Math.round(width), h: Math.round(height) };
}

// ---------------------------------------------------------------- 1. Pages and tour markers
begin("1. Pages load, with the guided tour's markers");
const PAGES = [
  ["/", ["Overview", 'data-tour="overview"', 'data-tour="theme-switch"', "Take the tour"]],
  ["/chat", ["New shipment", 'data-tour="chat-examples"', 'data-tour="live-manifest"']],
  ["/upload", ['data-tour="drop-area"', "cargopilot-sample-audit.xlsx"]],
  ["/audits", ["Recent audits"]],
  ["/audits?tab=how-it-decides", ['data-tour="decisions"', "Rulebook (fixed)", "Carrier rate card (fixed)"]],
];
for (const [p, must] of PAGES) {
  const { res, body } = await call(p);
  const missing = must.filter((m) => !String(body).includes(m));
  ok(`GET ${p}`, res.status === 200 && !missing.length, res.status !== 200 ? `status ${res.status}` : missing.length ? `missing ${missing.join(", ")}` : "");
}
for (const f of ["/samples/cargopilot-sample-audit.xlsx", "/samples/Case2_Shipment_Booking_Test_Data_Format.xlsx"]) {
  const { res } = await call(f, { raw: true });
  ok(`Download ${path.basename(f)}`, res.status === 200);
}
const old = await call("/how-it-works");
ok("Old /how-it-works link redirects to How it decides", [307, 308].includes(old.res.status) && /how-it-decides/.test(old.res.headers.get("location") ?? ""), old.res.headers.get("location"));
ok("Session cookie issued", Boolean(cookie));

// ---------------------------------------------------------------- 2. Chat booking
begin("2. New shipment in chat (AI extraction + the ten checks)");
const SAMPLE = "Northfield Goods here. Shipping from Leeds to a business address in Rotterdam, ready 20-11-2026, balanced priority. 2 pallets, 60 cartons, 700 kg gross, declared value £6,000. Items: 1,200 steel water bottles, SKU BTL-01, HS 732393, £5 each, 20 per carton, 60 cartons, 0.45 kg each, made in China.";
const chat = await call("/api/chat", { method: "POST", json: { message: SAMPLE } });
const cv = chat.body.view;
ok("Chat creates a booking", chat.res.status === 200 && chat.body.id, chat.res.status !== 200 ? JSON.stringify(chat.body).slice(0, 150) : chat.body.view?.booking?.bookingId);
if (cv) {
  const b = cv.booking;
  ok("Extracted seller, route, date, pallets, weight, value", b.sellerName === "Northfield Goods" && b.originCity === "Leeds" && b.destinationCity === "Rotterdam" && b.readyToShipDate === "2026-11-20" && b.pallets === 2 && b.grossWeightKg === 700 && b.declaredValue === 6000,
    `${b.sellerName}, ${b.originCity}→${b.destinationCity}, ${b.readyToShipDate}, ${b.pallets} pallets, ${b.grossWeightKg} kg, £${b.declaredValue}`);
  ok("Extracted the item line", cv.items.length === 1 && cv.items[0].quantity === 1200 && cv.items[0].hsCode === "732393", `${cv.items.length} item(s)`);
  const ids = [...new Set(cv.results.map((r) => r.ruleId))];
  ok("All ten checks R-01..R-10 ran", ids.length === 10, ids.join(" "));
  ok("Booking is Cleared for Dispatch", cv.readiness === "cleared", cv.readiness);
  ok("A carrier is recommended", Boolean(cv.carriers.recommended), cv.carriers.recommended?.carrier?.carrier);
  ok("Assistant replied", typeof chat.body.reply === "string" && chat.body.reply.length > 10);
  const page = await call(`/booking/${chat.body.id}`);
  // Documents (invoice) only appear once a booking is confirmed; checked on SA-01 below.
  const marks = ['data-tour="flight-deck"', 'data-tour="carrier-recommended"'];
  const miss = marks.filter((m) => !String(page.body).includes(m));
  ok("Flight Deck page renders with its tour markers", page.res.status === 200 && !miss.length, miss.join(", "));
}

// ---------------------------------------------------------------- 3. Past date rejection
begin("3. Past ready-to-ship dates are rejected in chat");
const past = await call("/api/chat", { method: "POST", json: { message: "Test Goods Ltd, shipping from Leeds to a business address in Rotterdam, ready 20-11-2025." } });
const pid = past.body.id;
ok("Past date is not saved", past.res.status === 200 && past.body.view.booking.readyToShipDate == null, `ready=${past.body.view?.booking?.readyToShipDate}`);
ok("Past date is held as rejected", past.body.view?.booking?.pendingReadyDate?.value === "2025-11-20");
ok("Reply says it's in the past and asks for today or later", /past/i.test(past.body.reply) && /today|later/i.test(past.body.reply), past.body.reply?.split("\n").find((l) => /past/i.test(l))?.slice(0, 140));
const insist = await call("/api/chat", { method: "POST", json: { bookingId: pid, message: "No, keep 20-11-2025, that's correct." } });
ok("Insisting on the past date still doesn't save it", insist.body.view?.booking?.readyToShipDate == null);
const fixDate = await call("/api/chat", { method: "POST", json: { bookingId: pid, message: "Use 20-11-2026" } });
ok("A future date is saved", fixDate.body.view?.booking?.readyToShipDate === "2026-11-20" && !fixDate.body.view?.booking?.pendingReadyDate, fixDate.body.view?.booking?.readyToShipDate);

// ---------------------------------------------------------------- 4. Workbook upload
begin("4. Upload the sample workbook");
const wb = XLSX.read(fs.readFileSync(path.join(ROOT, "public/samples/cargopilot-sample-audit.xlsx")));
const sheets = Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null })]));
const up = await call("/api/audit", { method: "POST", json: { fileName: "e2e-sample.xlsx", sheets } });
ok("Upload accepted", up.res.status === 200 && up.body.uploadId, up.res.status !== 200 ? JSON.stringify(up.body).slice(0, 150) : "");
const audit = await call(`/api/uploads/${up.body.uploadId}`);
const rows = audit.body.bookings ?? [];
ok("Eight bookings imported", rows.length === 8, `${rows.length} bookings`);
const tally = rows.reduce((t, r) => ({ ...t, [r.readiness]: (t[r.readiness] ?? 0) + 1 }), {});
ok("Mix of Grounded / Needs Attention / Cleared", Object.keys(tally).length >= 2, JSON.stringify(tally));
const auditPage = await call(`/audit/${up.body.uploadId}`);
ok("Audit results page renders", auditPage.res.status === 200);
const xl = await call(`/api/uploads/${up.body.uploadId}/workbook`, { raw: true });
ok("Corrected workbook downloads", xl.res.status === 200 && xl.bytes.length > 1000, `${xl.bytes.length} bytes`);

// ---------------------------------------------------------------- 5. Error Detective
begin("5. Error Detective: apply a suggested fix, keep a value with a note");
let fixed = false;
for (const r of rows.filter((x) => x.readiness !== "cleared")) {
  const one = await call(`/api/bookings/${r.id}`);
  const v = one.body.view;
  const f = v?.results.find((x) => x.status === "fail" && x.suggestions?.[0]?.kind === "set");
  if (!f) continue;
  const s = f.suggestions[0];
  const after = await act(r.id, { type: "apply", path: s.path, value: s.value, ruleId: f.ruleId, suggested: true });
  const now = after.body.view?.results.find((x) => x.key === f.key);
  ok(`${r.bookingRef} ${f.ruleId}: "${s.label}" fixes it`, after.res.status === 200 && (!now || now.status !== "fail"), now?.status ?? "resolved");
  ok("The fix is in the Audit trail with its old value", after.body.history?.some((h) => h.field_path === s.path && h.action === "accepted_fix"));
  const amber = after.body.view.results.find((x) => x.status === "fail" && x.severity === "Amber");
  if (amber) {
    const kept = await act(r.id, { type: "keep", key: amber.key, ruleId: amber.ruleId, reason: "Checked with the buyer, this is correct." });
    ok(`Keep ${amber.ruleId} with a note`, kept.body.view?.results.find((x) => x.key === amber.key)?.keptReason);
    await act(r.id, { type: "unkeep", key: amber.key, ruleId: amber.ruleId });
  }
  fixed = true;
  break;
}
ok("Found a booking with a one-click fix to test", fixed);
const bad = await act(rows[0].id, { type: "apply", path: "booking.pallets", value: "lots" });
ok("Invalid values are refused", bad.res.status === 400, bad.body.error);

// ---------------------------------------------------------------- 6. Invoice, compliance, labels on SA-01
begin("6. Commercial invoice: draft, blockers, approval, out of date");
const sa = rows.find((r) => r.bookingRef === "SA-01");
const id = sa.id;
let p = (await call(`/api/bookings/${id}`)).body;
ok("SA-01 starts Cleared for Dispatch", p.view.readiness === "cleared", p.view.readiness);
ok("Invoice starts Not approved", p.invoice.state === "not_approved");

const draft = await call(`/api/bookings/${id}/invoice`, { raw: true });
const di = await pdfInfo(draft.bytes);
ok("Draft invoice PDF generates", draft.res.status === 200 && di.isPdf, `${di.pages} page(s), ${draft.bytes.length} bytes, ${draft.res.headers.get("content-disposition")}`);
ok("Draft file is named DRAFT-…", /DRAFT-/.test(draft.res.headers.get("content-disposition") ?? ""));

const early = await act(id, { type: "approve", approverName: "Ana Lee" });
ok("Approval refused before the booking is confirmed", early.res.status === 409 && /Confirm the booking/.test(early.body.error), early.body.error?.slice(0, 160));

const labelsEarly = await call(`/api/bookings/${id}/labels?format=a6&which=all`);
ok("Labels blocked until addresses are added", labelsEarly.res.status === 409, labelsEarly.body.error?.slice(0, 120));

const COL = { company: "Brightwear Ltd", street: "1 Shoreditch High St", postcode: "E1 6PJ", contactName: "Ana Lee", phone: "+44 20 7946 0000", email: "ops@brightwear.example", notes: null };
const DEL = { company: "Spree Handel GmbH", street: "Torstraße 10", postcode: "10119", contactName: "Jan Weber", phone: "+49 30 1234567", email: "lager@spree.example", notes: null };
for (const [pth, val] of [["collection", COL], ["delivery", DEL]]) p = (await act(id, { type: "apply", path: pth, value: val })).body;
for (let i = 0; i < p.view.items.length; i++) p = (await act(id, { type: "apply", path: `items.${i}.countryOfOrigin`, value: "United Kingdom" })).body;
ok("Addresses saved", p.view.booking.collection?.postcode === "E1 6PJ" && p.view.booking.delivery?.postcode === "10119");

const conf = await act(id, { type: "confirm" });
ok("Booking confirmed", conf.res.status === 200 && conf.body.view.booking.sellerConfirmedAt, conf.body.error);

const blocked = await act(id, { type: "approve", approverName: "Ana Lee" });
ok("Approval refused while invoice/compliance checks fail", blocked.res.status === 409, blocked.body.error?.slice(0, 200));

const INVOICE = [
  ["invoice.issueDate", "27-10-2026"], ["invoice.orderReference", "PO-7731"], ["invoice.orderDate", "20-10-2026"],
  ["invoice.paymentMethod", "Bank transfer, 30 days"], ["invoice.incoterm", "DAP"], ["invoice.incotermPlace", "Berlin"],
  ["invoice.buyerType", "B2B"], ["invoice.exporterEori", "GB123456789000"], ["invoice.buyerEori", "DE123456789012345"],
  ["invoice.originStatement", "Approved statement of origin text (supplied by the seller)"],
  ["compliance.exportAgent", "Example Forwarding Ltd"], ["compliance.classificationCheckedBy", "Ana Lee"],
  ["compliance.goodsSentOn", "02-11-2026"],
  ["compliance.evidence", { type: "Courier airway bill number", reference: "AWB 123-45678901", obtainedOn: "03-11-2026" }],
];
let refused = [];
for (const [pth, val] of INVOICE) {
  const r = await act(id, { type: "apply", path: pth, value: val });
  if (r.res.status !== 200) refused.push(`${pth}: ${r.body.error}`);
  else p = r.body;
}
ok("Invoice and compliance details saved", !refused.length, refused.join("; "));
ok("Document edits don't undo the confirmation", Boolean(p.view.booking.sellerConfirmedAt));
const deck = await call(`/booking/${id}`);
ok("Confirmed booking page shows the Documents section (tour stop 9)", String(deck.body).includes('data-tour="invoice"') && String(deck.body).includes("Cargo labels"));

const previewBefore = await call(`/api/bookings/${id}/email?attach=1&replyTo=ops@brightwear.example`);
ok("Email preview blocks the attachment before approval", previewBefore.body.blocked && !previewBefore.body.attachment, previewBefore.body.blocked?.reason?.slice(0, 100));

const approve = await act(id, { type: "approve", approverName: "Ana Lee" });
ok("Invoice approved", approve.res.status === 200 && approve.body.invoice?.state === "approved", approve.body.error ?? approve.body.invoice?.approval?.invoice_number);
ok("Approval recorded in the Audit trail", approve.body.history?.some((h) => h.field_path === "invoice.approval"));

const final = await call(`/api/bookings/${id}/invoice?copy=approved`, { raw: true });
const fi = await pdfInfo(final.bytes);
ok("Approved PDF is served (hash-checked)", final.res.status === 200 && fi.isPdf && final.res.headers.get("x-invoice-state") === "approved", `${final.bytes.length} bytes, ${final.res.headers.get("content-disposition")}`);
ok("Approved PDF size matches what was stored", final.bytes.length === approve.body.invoice?.approval?.pdf_size);
fs.writeFileSync(path.join(OUT, "approved-invoice.pdf"), final.bytes);

const preview = await call(`/api/bookings/${id}/email?attach=1&replyTo=ops@brightwear.example`);
ok("Email preview now attaches the approved invoice", preview.body.attachment?.fileName && !preview.body.blocked, `${preview.body.attachment?.fileName}, ${preview.body.attachment?.sizeBytes} bytes`);
ok("Email text mentions the attached invoice", /invoice/i.test(preview.body.text ?? ""));

const stale = await act(id, { type: "apply", path: "invoice.paymentMethod", value: "Bank transfer, 14 days" });
ok("Changing the invoice puts the approval out of date", stale.body.invoice?.state === "out_of_date", stale.body.invoice?.state);
const staleMail = await call(`/api/bookings/${id}/email?attach=1&replyTo=ops@brightwear.example`);
ok("Out-of-date invoice can't be attached", Boolean(staleMail.body.blocked), staleMail.body.blocked?.reason?.slice(0, 90));
const again = await act(id, { type: "approve", approverName: "Ana Lee" });
ok("Re-approving makes it current again", again.body.invoice?.state === "approved");

const badMail = await call(`/api/bookings/${id}/email`, { method: "POST", json: { to: "not-an-email", replyTo: "ops@brightwear.example" } });
ok("Email form rejects an invalid carrier address (nothing sent)", [400, 503].includes(badMail.res.status), badMail.body.error);

begin("7. Tax and customs checks and the Compliance report");
const comp = await call(`/api/bookings/${id}/compliance-report`, { raw: true });
const ci = await pdfInfo(comp.bytes);
ok("Compliance report PDF generates", comp.res.status === 200 && ci.isPdf, `${ci.pages} page(s)`);

begin("8. Cargo labels");
const b = p.view.booking;
const n = { all: b.pallets + b.cartons, pallets: b.pallets, cartons: b.cartons };
ok("SA-01 package counts", b.pallets > 0 && b.cartons > 0, `${b.pallets} pallets, ${b.cartons} cartons`);
const SIZES = { a6: [298, 420], "4x6": [288, 432], a4: [595, 842] };
for (const format of ["a6", "4x6", "a4"]) {
  for (const which of ["all", "pallets", "cartons"]) {
    const l = await call(`/api/bookings/${id}/labels?format=${format}&which=${which}`, { raw: true });
    const li = await pdfInfo(l.bytes);
    const want = format === "a4" ? Math.ceil(n[which] / 4) : n[which];
    const [w, h] = SIZES[format];
    const sizeOk = Math.abs(li.w - w) <= 2 && Math.abs(li.h - h) <= 2;
    ok(`${format} · ${which}: ${want} page(s)`, l.res.status === 200 && li.pages === want && sizeOk, `${li.pages} pages, ${li.w}×${li.h} pt`);
    if (format === "a6" && which === "all") fs.writeFileSync(path.join(OUT, "labels-a6-all.pdf"), l.bytes);
  }
}

// ---------------------------------------------------------------- Summary
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`- [${f.section}] ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
}
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
process.exit(failed.length ? 1 : 0);
