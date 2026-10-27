import "server-only";
import bwipjs from "bwip-js/node";
import type { PDFImage, PDFPage } from "pdf-lib";
import type { CargoLabel, LabelFormat } from "../../labels";
import { BLACK, MM, newDoc, safe, wrap, type Fonts } from "./kit";

// Black on white, minimum 12 pt, barcodes rendered locally at 300 dpi.
const SIZES: Record<LabelFormat, { w: number; h: number }> = {
  a6: { w: 105 * MM, h: 148 * MM },
  "4x6": { w: 4 * 72, h: 6 * 72 },
  a4: { w: 210 * MM, h: 297 * MM },
};
const MIN_PT = 12;

async function barcode(code: string): Promise<Uint8Array> {
  // scale 4 ≈ 300 dpi at the printed width used below.
  return bwipjs.toBuffer({ bcid: "code128", text: code, scale: 4, height: 14, includetext: false, backgroundcolor: "FFFFFF" });
}

function drawLabel(page: PDFPage, fonts: Fonts, l: CargoLabel, x0: number, y0: number, w: number, h: number, img: PDFImage) {
  const pad = 6 * MM;
  const inner = w - pad * 2;
  let y = y0 + h - pad; // top, in PDF coordinates (origin bottom-left)
  const put = (text: string, size: number, bold = false, mono = false) => {
    const font = mono ? fonts.mono : bold ? fonts.bold : fonts.regular;
    for (const line of wrap(font, text, size, inner)) {
      y -= size * 1.18;
      page.drawText(safe(font, line), { x: x0 + pad, y, size, font, color: BLACK });
    }
  };
  const rule = () => { y -= 4; page.drawLine({ start: { x: x0 + pad, y }, end: { x: x0 + w - pad, y }, thickness: 0.8, color: BLACK }); y -= 2; };

  put(l.bookingRef, 30, true);
  put(`${l.kind} ${l.n} of ${l.of}`, 18, true);
  rule();
  put("FROM", MIN_PT, true);
  put(l.from.join(", "), MIN_PT);
  rule();
  put("TO", MIN_PT, true);
  l.to.forEach((t, i) => put(t, i === 0 ? 14 : 13, i === 0 || i === l.to.length - 1));
  if (l.contact) put(`Contact: ${l.contact}`, MIN_PT);
  rule();
  put(`${l.route} · ${l.carrier}`, MIN_PT);
  put(`Collection ${l.collection} · ${l.weight}`, MIN_PT);
  put(`${l.totals} · Seller: ${l.seller}`, MIN_PT);
  if (l.note) {
    rule();
    put(l.note, 14, true);
  }
  // Barcode across the bottom, with the encoded text under it.
  const bh = 16 * MM;
  const bw = Math.min(inner, img.width * (bh / img.height));
  const by = y0 + pad + MIN_PT * 1.4;
  page.drawImage(img, { x: x0 + (w - bw) / 2, y: by, width: bw, height: bh });
  const tw = fonts.mono.widthOfTextAtSize(l.code, MIN_PT);
  page.drawText(l.code, { x: x0 + (w - tw) / 2, y: y0 + pad, size: MIN_PT, font: fonts.mono, color: BLACK });
}

function cropMarks(page: PDFPage, x: number, y: number, w: number, h: number) {
  const m = 4 * MM, gap = 1.5 * MM;
  for (const [cx, cy, dx, dy] of [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]] as const) {
    page.drawLine({ start: { x: cx + dx * gap, y: cy }, end: { x: cx + dx * (gap + m), y: cy }, thickness: 0.4, color: BLACK });
    page.drawLine({ start: { x: cx, y: cy + dy * gap }, end: { x: cx, y: cy + dy * (gap + m) }, thickness: 0.4, color: BLACK });
  }
}

export async function labelsPdf(labels: CargoLabel[], format: LabelFormat, at: Date): Promise<Uint8Array> {
  const { doc, fonts } = await newDoc(`Cargo labels ${labels[0]?.bookingRef ?? ""}`, at);
  const images = new Map<string, PDFImage>();
  for (const l of labels) images.set(l.code, await doc.embedPng(await barcode(l.code)));
  const size = SIZES[format];
  if (format === "a4") {
    // 2 × 2 grid of A6-sized cells, crop marks at each cell's corners.
    const cw = size.w / 2, ch = size.h / 2, inset = 4 * MM;
    for (let i = 0; i < labels.length; i += 4) {
      const page = doc.addPage([size.w, size.h]);
      labels.slice(i, i + 4).forEach((l, j) => {
        const x = (j % 2) * cw, y = size.h - (Math.floor(j / 2) + 1) * ch;
        drawLabel(page, fonts, l, x + inset, y + inset, cw - inset * 2, ch - inset * 2, images.get(l.code)!);
        cropMarks(page, x + inset, y + inset, cw - inset * 2, ch - inset * 2);
      });
    }
  } else {
    for (const l of labels) {
      const page = doc.addPage([size.w, size.h]);
      drawLabel(page, fonts, l, 0, 0, size.w, size.h, images.get(l.code)!);
    }
  }
  return doc.save({ useObjectStreams: false });
}
