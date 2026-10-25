import { notFound } from "next/navigation";
import { AuditResults } from "@/components/AuditResults";
import { loadUpload } from "@/lib/server/uploads";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit results · CargoPilot" };

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadUpload(id);
  if (!data) notFound();
  return <AuditResults data={data} />;
}
