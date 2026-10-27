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
  { id: "overview", path: () => "/", target: "overview", title: "Overview", body: "Pre-flight checks for UK to Germany, France and Netherlands freight. Your bookings, their checks and your recent audits show on this page. This tour won't change anything." },
  { id: "theme", path: () => null, target: "theme-switch", title: "Light and dark mode", body: "The sun and moon switch changes between light and dark mode. Use it whenever you like; the tour won't change it for you." },
  { id: "chat", path: () => "/chat", target: "chat-examples", title: "New shipment", body: "Describe your shipment as you normally would, or start from one of these examples. You can change any detail at any time." },
  { id: "live-manifest", path: () => "/chat", target: "live-manifest", title: "Live manifest", body: "Your booking takes shape here. Once there's enough to go on, all ten pre-flight checks (R-01 to R-10) run live." },
  { id: "upload", path: () => "/upload", target: "drop-area", title: "Audit every booking in one upload", body: "Drop a workbook here (.xlsx or .csv) to check many bookings at once, or try the sample workbook and blank template below. Your file is never changed." },
  { id: "flight-deck", path: booking, when: hasBooking, target: "flight-deck", title: "Flight Deck", body: "Your most recent booking: Grounded, Needs Attention or Cleared for Dispatch, with each of the ten checks (R-01 to R-10) marked passed, warning or critical." },
  {
    id: "issue", path: booking, when: hasBooking, target: "issue", title: "Error Detective",
    body: "Each problem shows the numbers behind it and a suggested fix. Fixes apply only when you click them, and every change is saved with its old value in the Audit trail.",
    sample: {
      title: "Error Detective (Sample)",
      body: "This booking has no problems, so here's how one looks: \"R-02 Declared value: Found £4,500.00, Expected £5,000.00 (±1%)\" with a suggested fix. Fixes apply only when you click them, and every change is saved with its old value in the Audit trail.",
    },
  },
  { id: "carrier", path: booking, when: hasBooking, target: "carrier-recommended", title: "Carrier Matchmaker", body: "The best carrier for your priority (Cheapest, Fastest, Most reliable or Balanced), why it was picked, and every other carrier on the route below it." },
  // Optional: only when the feature exists in this build and is on the page.
  { id: "documents", path: booking, when: (c) => hasBooking(c) && FEATURES.invoice, target: "invoice", title: "Documents", body: "The commercial invoice is prefilled from the booking; approve it once its checks pass. Nearby are the tax and customs checks, cargo labels, and the carrier email, which can attach the approved invoice." },
  { id: "how-it-decides", path: () => "/audits?tab=how-it-decides", target: "decisions", title: "How it decides", body: "Who decides pass or fail? Fixed rules in the code, never the AI. This tab lists the rulebook and the carrier rate card every result uses." },
  { id: "finish", path: () => null, title: "You're ready.", body: "Start a booking in chat, or upload a spreadsheet to check many at once.", finish: true },
];
