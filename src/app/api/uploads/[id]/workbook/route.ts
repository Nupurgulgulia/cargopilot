import { NextResponse } from "next/server";
import { loadUploadExport } from "@/lib/server/exportData";
import { updatedWorkbook } from "@/lib/server/xlsxExport";

export const maxDuration = 60;

// The uploaded workbook with its original sheets untouched, plus CargoPilot's change sheets.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadUploadExport(id);
  if (!data) return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  const buf = await updatedWorkbook(data);
  const base = data.fileName.replace(/\.(xlsx|xlsm|xls)$/i, "").replace(/[^\w.-]+/g, "_");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}-cargopilot-updated.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
