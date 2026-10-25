import { notFound } from "next/navigation";
import { AuditResults } from "@/components/AuditResults";
import { sessionId } from "@/lib/server/db";
import { loadUpload } from "@/lib/server/uploads";

export const dynamic = "force-dynamic";

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadUpload(await sessionId(), id);
  if (!data) notFound();
  return <AuditResults data={data} />;
}
