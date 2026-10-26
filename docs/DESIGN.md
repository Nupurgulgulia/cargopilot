# CargoPilot design system

CargoPilot ships with two approved design versions. Both share the same layout, components and motion. Only the tokens differ.

| Version | How to see it | Saved at |
| --- | --- | --- |
| **Orange ("Skyline")**, the default | the switch in the nav, or `?theme=orange` | branch `design/skyline-orange`, tag `skyline-orange-v1` |
| **Dusk** (violet dashboard) | the switch in the nav, or `?theme=dusk` | branch `design/dusk-theme` |

The choice is saved in `localStorage` (`cp-theme`) and applied before first paint (`THEME_BOOT` in `src/lib/theme.ts`). Dusk is defined in `src/app/globals.css` under `[data-theme="dusk"]`. If one version is dropped later, delete its token block and the switch. Keep everything else.

## Dusk at a glance

- **Reference:** Octet's "Interactive dashboards" palette (https://octet.design/colors/palette/interactive-dashboards-color-palette-1731331224/): `#A887CE`, `#7B6E7F`, `#9C526D`, `#4D3E50`, `#292631` and `#171821`.
- **Surfaces:** a near-black violet canvas (`#171821`) with soft mulberry and lavender glows, and cards in `#211f2a` / `#292631`.
- **Accent:** pink (`#e46a93`). Tickets (the nav, Flight Deck, recommended carrier and toasts) use a lavender-to-mulberry gradient.
- **Statuses:** coral red `#ff6b7a`, gold `#f2c45a` and mint `#5dd39e`.
- **Font:** Plus Jakarta Sans (Orange uses Poppins). JetBrains Mono stays for codes.

---

# Version 1: "Skyline" (Orange)

This was the first approved look. Keep it in every future build. Change it only when the owner asks for a different design.

Reference: Softvence's "Navigating the Skies: Flight Booking Mobile App" on Dribbble
(https://dribbble.com/shots/23288427-Navigating-the-Skies-Flight-Booking-Mobile-App).

All tokens live in `src/app/globals.css`. Fonts are set in `src/app/layout.tsx`.

## Colour

| Role | Value | Where |
| --- | --- | --- |
| Sky | `#f47b20` → `#f89a55` → `#fbbf94` → `#fde3d1` → canvas | Page background gradient behind the header |
| Canvas | `#fff6f0` | Page background below the sky |
| Card | `#ffffff`, border `#f0e4da`, soft warm shadow | Default surfaces |
| Ticket | `#2b2522` (raised `#352e2a`) | Navigation pill, Flight Deck, recommended carrier, toasts |
| Accent | `#f47b20` (on dark `#ff8a3d`) | Main buttons, the active nav item, links, the active route on the map |
| Critical | `#f04438` | Grounded, Red rules |
| Warning | `#f5c518` with dark text `#3d2a00` | Needs Attention, Amber rules |
| Cleared | `#33b24c` / `#4cc764` | Cleared for Dispatch, passed checks |

The `teal-*` Tailwind classes in the code mean the accent, which is now orange. `slate-*` is the warm neutral scale. Both read their values from CSS variables:
- Light is the default.
- Wrap a region in `.ticket` for the dark charcoal surface.
- Wrap a region in `.paper` to force white.

Never hard-code hex values in components. Use the scales or the `--color-*` aliases.

## Type

- **Poppins** (400, 500, 600 and 700) for everything in the interface.
- **JetBrains Mono** only for codes: booking IDs, rule IDs (R-01…), HS codes and the departure-board status.
- Page titles are 24px bold. Card titles are 16px bold. Labels are 11px uppercase semibold.

## Shapes

- Cards: `rounded-3xl`. Inner fields ("bubbles"): `rounded-2xl` with a light fill.
- Buttons, chips, filters and status badges are full pills (`rounded-full`).
- Statuses are **solid pills**: red with white text, yellow with dark text, green with white text.

## Signature elements

- **Floating nav:** a dark charcoal pill at the top. The active page is an orange pill that slides between items.
- **Boarding-pass ticket** (Flight Deck):
  - The 3-letter origin and destination codes in large type.
  - A dashed arc between them, with the vehicle in an orange circle and the transit time.
  - A `.perforation` tear line with notches on both sides.
- **Bubbles:** booking fields, items, addresses, the confirmation summary and the next steps are all rounded tiles.

## Motion (keep all of this)

- **Lane explorer on the Overview** (`src/components/motion/RouteMap.tsx`):
  - Routes draw between the UK and EU cities.
  - A vehicle travels along the active lane.
  - Clicking a city switches the lane and its rate card.
  - It cycles on its own until clicked.
  - **This animation must stay in every build.**
- **Flight Deck:**
  - The status changes letter by letter (`DepartureBoard`).
  - R-01 to R-10 tick in order.
  - The progress ring fills.
- **Lists:** issue cards slide in, and audit rows reshuffle when filtered (GSAP Flip).
- **Feedback:** a toast after every action, and the ⌘K command palette.
- **Reduced motion:** everything respects "reduce motion" (`reducedMotion()` in `src/components/motion/gsap.ts`).
