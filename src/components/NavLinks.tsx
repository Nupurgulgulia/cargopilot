"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/chat", label: "New shipment" },
  { href: "/upload", label: "Upload audit" },
  { href: "/audits", label: "Recent audits" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
      {LINKS.map((l) => {
        // An individual audit (/audit/…) belongs under "Recent audits".
        const active = l.href === "/" ? path === "/" : l.href === "/audits" ? path.startsWith("/audit") : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 ${active ? "bg-white/10 text-white" : "text-slate-300 hover:text-white"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
