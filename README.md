# CargoPilot — your shipment co-pilot

Book UK → Germany / France / Netherlands shipments in plain language, or upload the Case 2 workbook,
and catch rulebook errors before the shipment leaves.

**Live:** https://cargopilot-app.vercel.app (no login)

## What it does
- **Chat booking** — Gemini extracts only what the seller states, the app asks only for what's missing,
  and any detail can be changed mid-conversation ("add a pallet"); checks and carrier ranking re-run instantly.
- **Workbook audit** — reads the Bookings and Items sheets, checks every booking and item row, flags
  unreadable cells, duplicate IDs, orphan items and bookings with no items. The template's grey example row is skipped.
- **Shipment Flight Deck** — Grounded / Needs Attention / Cleared for Dispatch, with issues grouped by risk.
- **Error Detective** — shows the calculation, the field at fault and one-click fixes; the seller can keep a value
  with a reason. Every change is logged with its original value.
- **Carrier Matchmaker** — ranks the fixed rate card by the seller's priority (Balanced = 40% cost, 30% speed,
  30% reliability), always with a runner-up and trade-off. Over-limit carriers are never recommended.
- **Confirmation & next steps**, plus a downloadable .xlsx audit report.

All ten rules are deterministic code (`src/lib/rules.ts`); AI never decides pass/fail.
Decisions the case left open are documented at `/how-it-works`.

## Stack
Next.js 15 · TypeScript · Tailwind · Gemini (`@google/genai`) · Neon Postgres · SheetJS · Vitest · Vercel

## Run locally
Create `.env.local` with `DATABASE_URL`, `GEMINI_API_KEY`, optional `GEMINI_API_KEY_FALLBACK` and `GEMINI_MODEL`, then:

```bash
npm install
npm run dev
npm test
```

`scripts/make-sample.mjs` regenerates `public/samples/cargopilot-sample-audit.xlsx` (8 bookings with planted errors).
