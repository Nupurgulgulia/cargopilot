// The guided tour, step by step. Every line describes something on the page it points at,
// reusing the app's own wording. The tour only explains: it never clicks, saves or sends anything.
import { FEATURES } from "@/lib/features";

export interface TourContext {
  /** First booking in Recent bookings, if there is one. */
  bookingId: string | null;
}

export interface TourStep {
  id: string;
  /** Page the step lives on (null = stay where you are). */
  path: (ctx: TourContext) => string | null;
  /** data-tour value of the element to spotlight (none = a centred card). */
  target?: string;
  title: string;
  body: string;
  /** Shown instead, as a centred "Sample" card, when the target isn't on the page. */
  sample?: { title: string; body: string };
  /** Skip the step entirely when this is false. */
  when?: (ctx: TourContext) => boolean;
  /** Last step: shows the finishing buttons. */
  finish?: boolean;
}

const hasBooking = (c: TourContext) => Boolean(c.bookingId);
const booking = (c: TourContext) => (c.bookingId ? `/booking/${c.bookingId}` : null);

export const STEPS: TourStep[] = [
  // 1. Overview
  { id: "overview", path: () => "/", target: "overview-title", title: "Overview", body: "Pre-flight checks for UK to Germany, France and Netherlands freight. This tour shows you around; it won't change anything." },
  { id: "counters", path: () => "/", target: "counters", title: "Your bookings at a glance", body: "Bookings checked, Critical issues, Warnings and Cleared for dispatch, counted across your chat and spreadsheet bookings." },
  { id: "recent-bookings", path: () => "/", target: "recent-bookings", title: "Recent bookings", body: "Your latest shipments, each with its status: Grounded, Needs Attention or Cleared for Dispatch." },
  { id: "recent-audits", path: () => "/", target: "recent-audits", title: "Recent audits", body: "Spreadsheets you've uploaded, with how many bookings each one held." },
  // 2. Theme
  { id: "theme", path: () => null, target: "theme-switch", title: "Light and dark mode", body: "The sun and moon switch changes between light and dark mode. Use it whenever you like; the tour won't change it for you." },
  // 3. New shipment
  { id: "chat", path: () => "/chat", target: "chat-greeting", title: "New shipment", body: "Write as you normally would. You can change any detail at any time." },
  { id: "chat-examples", path: () => "/chat", target: "chat-examples", title: "Or start from an example", body: "Three example messages you can send to see a booking come together." },
  { id: "live-manifest", path: () => "/chat", target: "live-manifest", title: "Live manifest", body: "Your booking takes shape here. Once there's enough to go on, all ten pre-flight checks (R-01 to R-10) run live." },
  // 4. Upload audit
  { id: "drop-area", path: () => "/upload", target: "drop-area", title: "Audit every booking in one upload", body: "Drop a workbook here: .xlsx or .csv, Bookings + Items, dates DD-MM-YYYY, GBP. Your file is never changed." },
  { id: "samples", path: () => "/upload", target: "samples", title: "Sample workbook and blank template", body: "Try the sample workbook (eight bookings with deliberate mistakes), or use the blank template for your own bookings." },
  // 5. Flight Deck
  { id: "booking-summary", path: booking, when: hasBooking, target: "booking-summary", title: "Flight Deck", body: "This is your most recent booking. The summary shows every detail CargoPilot holds for it." },
  { id: "flight-deck", path: booking, when: hasBooking, target: "flight-deck", title: "Status and score", body: "Grounded, Needs Attention or Cleared for Dispatch, and a ring showing how many of the ten checks pass." },
  { id: "checklist", path: booking, when: hasBooking, target: "checklist", title: "The ten checks", body: "R-01 to R-10, each marked passed, warning or critical." },
  // 6. Error Detective
  {
    id: "issue", path: booking, when: hasBooking, target: "issue", title: "Error Detective",
    body: "Each problem shows the numbers behind it and a suggested fix. Fixes apply only when you click them, and every change is saved with its old value in the Audit trail.",
    sample: {
      title: "Error Detective (Sample)",
      body: "This booking has no problems, so here's how one looks: \"R-02 Declared value: Found £4,500.00, Expected £5,000.00 (±1%)\" with a suggested fix. Fixes apply only when you click them, and every change is saved with its old value in the Audit trail.",
    },
  },
  // 7. Carrier Matchmaker
  { id: "carrier-priority", path: booking, when: hasBooking, target: "carrier-priority", title: "Carrier Matchmaker", body: "Choose what matters most: Cheapest, Fastest, Most reliable or Balanced." },
  { id: "carrier-recommended", path: booking, when: hasBooking, target: "carrier-recommended", title: "The recommended carrier", body: "The best carrier for your priority, why it was picked, and the trade-off against the runner-up." },
  { id: "carrier-table", path: booking, when: hasBooking, target: "carrier-table", title: "Every carrier on the route", body: "Cost, transit, on-time rate, pallet limit and whether each carrier fits your load." },
  // 8. Confirmation and next steps
  { id: "confirm-summary", path: booking, when: hasBooking, target: "confirm-summary", title: "Booking confirmation & next steps", body: "A summary of the prepared booking to review before you confirm it." },
  { id: "next-steps", path: booking, when: hasBooking, target: "next-steps", title: "What happens next", body: "Your next steps. CargoPilot doesn't book the carrier or clear customs for you." },
  { id: "email-carrier", path: booking, when: hasBooking, target: "email-carrier", title: "Email the carrier", body: "Sends the checked booking details to the carrier and asks them to confirm the collection slot and price." },
  { id: "email-attach", path: booking, when: (c) => hasBooking(c) && FEATURES.invoiceEmail, target: "email-attach", title: "Attach approved invoice (PDF)", body: "The carrier email can attach the exact approved invoice. Turn it off and the email goes out as before." },
  // Optional: only when the feature exists in this build and is on the page.
  { id: "invoice", path: booking, when: (c) => hasBooking(c) && FEATURES.invoice, target: "invoice", title: "Commercial invoice", body: "Prefilled from the booking. Approve it once its checks pass; any later change puts the approval out of date." },
  { id: "compliance", path: booking, when: (c) => hasBooking(c) && FEATURES.compliance, target: "compliance", title: "Tax and customs checks", body: "Checks for the UK export side and the destination import side, with a Compliance report. Not tax or legal advice." },
  { id: "labels", path: booking, when: (c) => hasBooking(c) && FEATURES.labels, target: "labels", title: "Cargo labels", body: "One label per pallet and per carton, in A6, 4 × 6 in, or four per A4 sheet." },
  // 9. How it decides
  { id: "how-tab", path: () => "/audits?tab=how-it-decides", target: "audit-tabs", title: "Recent audits and How it decides", body: "Your uploaded spreadsheets, and a tab explaining how each check and recommendation is worked out." },
  { id: "decisions", path: () => "/audits?tab=how-it-decides", target: "decisions", title: "Fixed rules, never the AI", body: "Who decides pass or fail? Fixed rules in the code, never the AI. The same booking always gets the same result." },
  { id: "rulebook", path: () => "/audits?tab=how-it-decides", target: "rulebook", title: "Rulebook (fixed)", body: "The ten rules and their severity: Red or Amber." },
  { id: "rate-card", path: () => "/audits?tab=how-it-decides", target: "rate-card", title: "Carrier rate card (fixed)", body: "The prices, transit times, on-time rates and pallet limits every recommendation uses." },
  // 10. Finish
  { id: "finish", path: () => null, title: "You're ready.", body: "Start a booking in chat, or upload a spreadsheet to check many at once.", finish: true },
];
