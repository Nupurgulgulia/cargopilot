import Link from "next/link";
import { Logo } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
      <Logo className="h-12 w-12 text-teal-600" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-sm text-slate-600">
        The link may be mistyped, or the booking or audit no longer exists. You can start a new shipment or upload a workbook.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/chat" className="btn-primary">New shipment</Link>
        <Link href="/upload" className="btn-ghost">Upload workbook</Link>
        <Link href="/" className="btn-ghost">Dashboard</Link>
      </div>
    </div>
  );
}
