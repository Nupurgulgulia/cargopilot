import "server-only";
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";

// Small layout kit on top of pdf-lib: black on white, points (1/72 in), top-down cursor.
export const MM = 72 / 25.4;
export const A4 = { w: 595.28, h: 841.89 };
export const BLACK = rgb(0, 0, 0);
export const GREY = rgb(0.35, 0.35, 0.35);
export const LINE = rgb(0.75, 0.75, 0.75);

export interface Fonts { regular: PDFFont; bold: PDFFont; mono: PDFFont }

/** New document with fixed metadata, so the same input always produces the same bytes. */
export async function newDoc(title: string, at: Date): Promise<{ doc: PDFDocument; fonts: Fonts }> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(title);
  doc.setAuthor("CargoPilot");
  doc.setProducer("CargoPilot");
  doc.setCreator("CargoPilot");
  doc.setCreationDate(at);
  doc.setModificationDate(at);
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  return { doc, fonts };
}

/** Standard PDF fonts only cover WinAnsi: swap the few characters CargoPilot uses that they lack. */
export function safe(font: PDFFont, text: string): string {
  const swapped = text.replace(/→/g, "to").replace(/≈/g, "~").replace(/[‐-‒]/g, "-").replace(/ /g, " ");
  let out = "";
  for (const ch of swapped) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

/** Break text into lines that fit `width`. */
export function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  // Split on line breaks first: the standard fonts can't encode "\n" itself.
  for (const para of text.split("\n").map((p) => safe(font, p))) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

/** A page with a cursor `y` measured from the top. */
export class Sheet {
  y: number;
  constructor(public page: PDFPage, public fonts: Fonts, public margin = 15 * MM) {
    this.y = margin;
  }
  get width() { return this.page.getWidth() - this.margin * 2; }
  /** Draw text at (x from the left margin, current y); returns the height used. */
  text(t: string, opts: { x?: number; size?: number; bold?: boolean; mono?: boolean; width?: number; color?: ReturnType<typeof rgb>; lineGap?: number; align?: "left" | "right" } = {}): number {
    const size = opts.size ?? 9.5;
    const font = opts.mono ? this.fonts.mono : opts.bold ? this.fonts.bold : this.fonts.regular;
    const width = opts.width ?? this.width - (opts.x ?? 0);
    const lines = wrap(font, t, size, width);
    const lh = size * (opts.lineGap ?? 1.3);
    lines.forEach((l, i) => {
      const w = font.widthOfTextAtSize(l, size);
      const x = this.margin + (opts.x ?? 0) + (opts.align === "right" ? width - w : 0);
      this.page.drawText(l, { x, y: this.page.getHeight() - this.y - size - i * lh, size, font, color: opts.color ?? BLACK });
    });
    return lines.length * lh;
  }
  line(thickness = 0.6, color = LINE) {
    const y = this.page.getHeight() - this.y;
    this.page.drawLine({ start: { x: this.margin, y }, end: { x: this.margin + this.width, y }, thickness, color });
  }
  rect(x: number, yTop: number, w: number, h: number, thickness = 0.8) {
    this.page.drawRectangle({ x: this.margin + x, y: this.page.getHeight() - yTop - h, width: w, height: h, borderColor: BLACK, borderWidth: thickness });
  }
  gap(n: number) { this.y += n; }
  room(h: number) { return this.y + h <= this.page.getHeight() - this.margin; }
}
