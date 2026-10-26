import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans, Poppins } from "next/font/google";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { THEME_BOOT } from "@/lib/theme";
import { Logo } from "@/components/icons";
import { CommandPalette } from "@/components/motion/CommandPalette";
import { SpotlightTracker } from "@/components/motion/primitives";
import { Toaster } from "@/components/motion/Toaster";
import "./globals.css";

// Interface and code fonts. Swap them here; globals.css reads --font-ui and --font-code.
const ui = Poppins({ variable: "--font-ui", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const code = JetBrains_Mono({ variable: "--font-code", subsets: ["latin"] });
// The Dusk theme swaps the interface font to this one (see globals.css).
const dusk = Plus_Jakarta_Sans({ variable: "--font-dusk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CargoPilot: pre-flight checks for cross-border freight",
  description: "Book UK → EU freight in plain English. CargoPilot checks every booking against the rulebook and recommends the right carrier before anything ships.",
};

// Hide [data-reveal] elements before first paint only when JS runs and motion is allowed.
const MOTION_FLAG = `try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('js-motion')}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ui.variable} ${code.variable} ${dusk.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT + MOTION_FLAG }} />
      </head>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <header className="sticky top-0 z-40 px-4 pt-3">
          <div className="ticket mx-auto flex h-14 max-w-7xl items-center gap-4 rounded-full py-1.5 pl-3 pr-2 shadow-[0_12px_30px_-12px_rgb(31_26_23/0.55)]">
            <Link href="/" className="flex items-center gap-2.5">
              <Logo className="h-7 w-7" />
              <span className="hidden text-[15px] font-bold tracking-tight text-slate-900 sm:inline">CargoPilot</span>
            </Link>
            <NavLinks />
            <ThemeSwitch />
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="mt-16 border-t border-[var(--color-line)] bg-[var(--color-card)]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-slate-500">
            <span>CargoPilot · Pre-flight checks for UK → EU freight</span>
            <span>Prepares and checks bookings. It doesn&apos;t book carriers or clear customs.</span>
          </div>
        </footer>
        <CommandPalette />
        <Toaster />
        <SpotlightTracker />
      </body>
    </html>
  );
}
