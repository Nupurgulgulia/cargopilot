import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { Logo } from "@/components/icons";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CargoPilot — Pre-flight checks for cross-border freight",
  description: "Book UK → EU freight in plain English. CargoPilot checks every booking against the rulebook and recommends the right carrier before anything ships.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${geistMono.variable} min-h-screen font-sans antialiased`}>
        <header className="sticky top-0 z-30 border-b border-white/5 bg-navy-900/95 text-white backdrop-blur supports-[backdrop-filter]:bg-navy-900/85">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-4">
            <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
              <Logo className="h-7 w-7 text-teal-400" />
              <span className="text-[15px]">CargoPilot</span>
            </Link>
            <NavLinks />
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-12 border-t border-slate-200/80">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-slate-500">
            <span>CargoPilot · Pre-flight checks for UK → EU freight</span>
            <span>Prepares and checks bookings. It doesn&apos;t book carriers or clear customs.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
