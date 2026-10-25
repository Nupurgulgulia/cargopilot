import { redirect } from "next/navigation";

// "How it decides" now lives as a tab on the Audits page; keep old links working.
export default function HowItWorks() {
  redirect("/audits?tab=how-it-decides");
}
