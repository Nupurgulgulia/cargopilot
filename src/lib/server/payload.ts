import "server-only";
import { buildView } from "../view";
import type { BookingView } from "../types";
import { history, messages, type BookingRow, type CorrectionRow } from "./db";

export interface BookingPayload {
  id: string;
  source: "chat" | "upload";
  uploadId: string | null;
  view: BookingView;
  history: CorrectionRow[];
  messages: { role: "user" | "assistant"; content: string }[];
  original: BookingRow["original"];
  updatedAt: string;
}

export async function bookingPayload(row: BookingRow, viewOverride?: BookingView): Promise<BookingPayload> {
  const [h, m] = await Promise.all([history(row.id), row.source === "chat" ? messages(row.id) : Promise.resolve([])]);
  return {
    id: row.id,
    source: row.source,
    uploadId: row.upload_id,
    view: viewOverride ?? buildView(row.booking, row.items),
    history: h,
    messages: m,
    original: row.original,
    updatedAt: row.updated_at,
  };
}
