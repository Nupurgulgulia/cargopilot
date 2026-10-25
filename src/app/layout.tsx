import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { Logo } from "@/components/icons";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CargoPilot — Shipment Co-Pilot",
  description: "Book UK → EU shipments in plain language and catch errors before they leave.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen font-sans antialiased`}>
        <header className="sticky top-0 z-30 bg-navy-900 text-white shadow">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <Logo className="h-7 w-7 text-teal-400" />
              <span>CargoPilot</span>
              <span className="hidden text-xs font-normal text-slate-400 sm:inline">· your shipment co-pilot</span>
            </Link>
            <NavLinks />
          </div>
        </header>
        <main>{children}</main>
        <footer className="mx-auto max-w-7xl px-4 py-8 text-xs text-slate-500">
          CargoPilot checks bookings against the Case 2 rulebook and rate card. It prepares bookings — it does not book with
          carriers or clear customs.
        </footer>
      </body>
    </html>
  );
}
