import { APP_NAME } from "@/lib/config/app";
import {
  pdfAscii,
  pdfClip,
  pdfLine,
  pdfText,
  type PdfAlign,
  type PdfFont,
  type ReportDocMeta,
  type TableColumn,
} from "@/lib/pdf/report-document";

export const FORMAL_INK = "0.08 0.08 0.08";
export const FORMAL_MUTED = "0.42 0.42 0.42";
export const FORMAL_STROKE = "0.82 0.82 0.82";
export const FORMAL_HEADER = "0.945 0.945 0.945";
export const FORMAL_WHITE = "1 1 1";
export const FORMAL_RADIUS = 4;
const KAPPA = 0.5522847498;
const BODY_SIZE = 7.4;
const HEADER_SIZE = 6.8;
const LINE_GAP = 9;

export type FormalOrientation = "portrait" | "landscape";

export type FormalMeta = ReportDocMeta & {
  orientation?: FormalOrientation;
  brandName?: string;
  footerLeft?: string;
};

export type FormalCard = { label: string; value: string };

export type FormalTableOptions = {
  totalRow?: Record<string, string>;
  subtitle?: string;
  statusKey?: string;
  emphasize?: { key: string; values: string[] };
  emptyMessage?: string;
};

export function formalPageSize(orientation: FormalOrientation) {
  return orientation === "landscape" ? { pageW: 842, pageH: 595 } : { pageW: 595, pageH: 842 };
}

export function pdfRoundPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  const k = rr * KAPPA;
  const x0 = x;
  const x1 = x + w;
  const y0 = y;
  const y1 = y + h;
  return [
    `${(x0 + rr).toFixed(2)} ${y0.toFixed(2)} m`,
    `${(x1 - rr).toFixed(2)} ${y0.toFixed(2)} l`,
    `${(x1 - rr + k).toFixed(2)} ${y0.toFixed(2)} ${x1.toFixed(2)} ${(y0 + rr - k).toFixed(2)} ${x1.toFixed(2)} ${(y0 + rr).toFixed(2)} c`,
    `${x1.toFixed(2)} ${(y1 - rr).toFixed(2)} l`,
    `${x1.toFixed(2)} ${(y1 - rr + k).toFixed(2)} ${(x1 - rr + k).toFixed(2)} ${y1.toFixed(2)} ${(x1 - rr).toFixed(2)} ${y1.toFixed(2)} c`,
    `${(x0 + rr).toFixed(2)} ${y1.toFixed(2)} l`,
    `${(x0 + rr - k).toFixed(2)} ${y1.toFixed(2)} ${x0.toFixed(2)} ${(y1 - rr + k).toFixed(2)} ${x0.toFixed(2)} ${(y1 - rr).toFixed(2)} c`,
    `${x0.toFixed(2)} ${(y0 + rr).toFixed(2)} l`,
    `${x0.toFixed(2)} ${(y0 + rr - k).toFixed(2)} ${(x0 + rr - k).toFixed(2)} ${y0.toFixed(2)} ${(x0 + rr).toFixed(2)} ${y0.toFixed(2)} c`,
    "h",
  ].join(" ");
}

export function formalTextWidth(value: string, size: number, bold = false) {
  return pdfAscii(value).length * size * (bold ? 0.62 : 0.58);
}

export function wrapPdfLines(value: string, width: number, size: number, bold: boolean, maxLines: number) {
  const text = pdfAscii(String(value ?? "")).trim() || "—";
  const avail = Math.max(10, width - 10);
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  const fits = (chunk: string) => formalTextWidth(chunk, size, bold) <= avail;
  const hardBreak = (word: string) => {
    let rest = word;
    while (rest && !fits(rest)) {
      let cut = 1;
      while (cut < rest.length && fits(rest.slice(0, cut + 1))) cut += 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
      if (lines.length >= maxLines) return "";
    }
    return rest;
  };
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (fits(next)) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (lines.length >= maxLines) break;
    current = fits(word) ? word : hardBreak(word);
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (!lines.length) return ["—"];
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = pdfClip(kept[maxLines - 1], Math.max(3, Math.floor(avail / (size * (bold ? 0.62 : 0.58)))));
    return kept;
  }
  return lines;
}

function alignedX(x: number, width: number, value: string, size: number, bold: boolean, align: PdfAlign) {
  const tw = formalTextWidth(value, size, bold);
  if (align === "right") return Math.max(x + 3, x + width - tw - 4);
  if (align === "center") return x + Math.max(2, (width - tw) / 2);
  return x + 4;
}

export function drawClippedPdfLines(
  ops: string[],
  font: PdfFont,
  size: number,
  x: number,
  y: number,
  width: number,
  height: number,
  lines: string[],
  align: PdfAlign,
  fill = FORMAL_INK,
) {
  ops.push("q");
  ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re W n`);
  ops.push(`${fill} rg`);
  const bold = font === "F2";
  lines.forEach((line, lineIndex) => {
    const baseline = y + height - 5 - (lineIndex + 1) * (size + 1.6) + 2.2;
    ops.push(pdfText(font, size, alignedX(x, width, line, size, bold, align), baseline, line));
  });
  ops.push("Q");
}

export function buildOrientedPdf(pageStreams: string[], pageW: number, pageH: number) {
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const pageObjectIds = pageStreams.map((_, index) => 5 + index * 2);
  const contentObjectIds = pageStreams.map((_, index) => 6 + index * 2);
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageStreams.length} >>`,
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  pageStreams.forEach((stream, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let offset = 0;
  const chunks: string[] = ["%PDF-1.4\n"];
  offset = chunks[0].length;
  const xref: number[] = [0];
  objects.forEach((body, index) => {
    xref.push(offset);
    const object = `${index + 1} 0 obj\n${body}\nendobj\n`;
    chunks.push(object);
    offset += object.length;
  });
  const xrefStart = offset;
  let xrefTable = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  xref.slice(1).forEach((value) => {
    xrefTable += `${String(value).padStart(10, "0")} 00000 n \n`;
  });
  chunks.push(xrefTable, `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
  return new TextEncoder().encode(chunks.join(""));
}

function scaleColumns(columns: TableColumn[], tableW: number): TableColumn[] {
  const sum = columns.reduce((total, col) => total + col.width, 0) || 1;
  const scaled = columns.map((col) => ({ ...col, width: (col.width / sum) * tableW }));
  const used = scaled.reduce((total, col) => total + col.width, 0);
  scaled[scaled.length - 1].width += tableW - used;
  return scaled;
}

function cellValue(row: Record<string, string>, key: string) {
  const value = String(row[key] ?? "").trim();
  return value || "—";
}

function rowHeight(lines: number) {
  return Math.max(16, 8 + lines * LINE_GAP);
}

type PreparedRow = { lines: Record<string, string[]>; height: number; tint: boolean; bold: boolean };

function prepareRows(
  columns: TableColumn[],
  rows: Record<string, string>[],
  options?: FormalTableOptions,
): PreparedRow[] {
  const emphasize = options?.emphasize;
  const prepared = rows.map((row) => {
    const lines = Object.fromEntries(
      columns.map((col) => [col.key, wrapPdfLines(cellValue(row, col.key), col.width, BODY_SIZE, false, 2)]),
    ) as Record<string, string[]>;
    return {
      lines,
      height: rowHeight(Math.max(1, ...Object.values(lines).map((item) => item.length))),
      tint: Boolean(emphasize && emphasize.values.includes(row[emphasize.key] ?? "")),
      bold: Boolean(emphasize && emphasize.values.includes(row[emphasize.key] ?? "")),
    };
  });
  if (options?.totalRow) {
    const lines = Object.fromEntries(
      columns.map((col) => [col.key, wrapPdfLines(cellValue(options.totalRow!, col.key), col.width, BODY_SIZE, true, 2)]),
    ) as Record<string, string[]>;
    prepared.push({
      lines,
      height: rowHeight(Math.max(1, ...Object.values(lines).map((item) => item.length))),
      tint: true,
      bold: true,
    });
  }
  return prepared;
}

type PageState = { ops: string[]; y: number };

/**
 * Shared formal business-report document used by every RM Holdings PDF export.
 */
export class FormalReportDocument {
  private pages: PageState[] = [];
  private page: PageState;
  private meta: FormalMeta;
  private continuingSection: string | null = null;
  readonly pageW: number;
  readonly pageH: number;
  readonly marginX = 36;
  readonly marginTop = 30;
  readonly marginBottom = 28;
  readonly contentW: number;

  constructor(meta: FormalMeta) {
    this.meta = meta;
    const size = formalPageSize(meta.orientation ?? "portrait");
    this.pageW = size.pageW;
    this.pageH = size.pageH;
    this.contentW = this.pageW - this.marginX * 2;
    this.page = { ops: [], y: this.pageH - this.marginTop };
    this.pages.push(this.page);
    this.paintPageChrome(true);
  }

  private brand() {
    return pdfAscii(this.meta.brandName || APP_NAME).trim() || APP_NAME;
  }

  private paintPageChrome(full: boolean) {
    const ops = this.page.ops;
    ops.push(`${FORMAL_WHITE} rg`);
    ops.push(`0 0 ${this.pageW} ${this.pageH} re f`);
    const yTop = this.pageH - this.marginTop;
    ops.push(`${FORMAL_INK} rg`);
    ops.push(pdfText("F2", 12.5, this.marginX, yTop - 2, this.brand().toUpperCase()));
    if (this.meta.businessUnit) {
      ops.push(`${FORMAL_MUTED} rg`);
      ops.push(pdfText("F1", 8, this.marginX, yTop - 16, pdfAscii(this.meta.businessUnit)));
    }
    ops.push(`${FORMAL_MUTED} rg`);
    const periodCaption = "Report Period";
    ops.push(
      pdfText("F1", 8, this.pageW - this.marginX - formalTextWidth(periodCaption, 8), yTop - 2, periodCaption),
    );
    ops.push(`${FORMAL_INK} rg`);
    const dates = this.meta.periodDates || this.meta.periodLabel;
    ops.push(
      pdfText(
        "F2",
        8.5,
        this.pageW - this.marginX - formalTextWidth(dates, 8.5, true),
        yTop - 14,
        dates,
      ),
    );
    ops.push(`${FORMAL_MUTED} rg`);
    const generated = `Generated on: ${this.meta.generatedAt}`;
    ops.push(
      pdfText("F1", 7.5, this.pageW - this.marginX - formalTextWidth(generated, 7.5), yTop - 26, generated),
    );
    ops.push(`${FORMAL_STROKE} RG`);
    ops.push(pdfLine(this.marginX, yTop - 34, this.pageW - this.marginX, yTop - 34, 0.45));
    this.page.y = yTop - 50;

    if (!full) {
      if (this.continuingSection) {
        ops.push(`${FORMAL_INK} rg`);
        ops.push(pdfText("F2", 10, this.marginX, this.page.y, `${this.continuingSection} (continued)`));
        this.page.y -= 16;
      }
      return;
    }

    ops.push(`${FORMAL_INK} rg`);
    ops.push(pdfText("F2", 16, this.marginX, this.page.y, this.meta.title));
    this.page.y -= 14;
    if (this.meta.subtitle) {
      ops.push(`${FORMAL_MUTED} rg`);
      ops.push(pdfText("F1", 8, this.marginX, this.page.y, pdfAscii(this.meta.subtitle)));
      this.page.y -= 16;
    } else {
      this.page.y -= 4;
    }
  }

  private newPage(sectionTitle?: string) {
    if (sectionTitle) this.continuingSection = sectionTitle;
    this.page = { ops: [], y: this.pageH - this.marginTop };
    this.pages.push(this.page);
    this.paintPageChrome(false);
  }

  private ensureSpace(needed: number, sectionTitle?: string) {
    if (this.page.y - needed < this.marginBottom + 14) this.newPage(sectionTitle);
  }

  addMetrics(cards: FormalCard[]) {
    if (!cards.length) return;
    const rows = cards.length <= 3 ? [cards] : [cards.slice(0, 2), cards.slice(2)];
    for (const row of rows) {
      const gap = 8;
      const boxW = (this.contentW - gap * (row.length - 1)) / row.length;
      const boxH = 34;
      this.ensureSpace(boxH + 8);
      const boxY = this.page.y - boxH;
      row.forEach((card, index) => {
        const bx = this.marginX + index * (boxW + gap);
        const path = pdfRoundPath(bx, boxY, boxW, boxH, 3);
        this.page.ops.push(`${FORMAL_WHITE} rg`);
        this.page.ops.push(`${FORMAL_STROKE} RG`);
        this.page.ops.push("0.5 w");
        this.page.ops.push(`${path} B`);
        this.page.ops.push(`${FORMAL_MUTED} rg`);
        this.page.ops.push(pdfText("F1", 7.2, bx + 8, boxY + boxH - 12, pdfAscii(card.label)));
        this.page.ops.push(`${FORMAL_INK} rg`);
        const value = wrapPdfLines(card.value, boxW - 10, 11, true, 1)[0];
        this.page.ops.push(pdfText("F2", 11, bx + 8, boxY + 8, value));
      });
      this.page.y = boxY - 8;
    }
  }

  addTable(columns: TableColumn[], rows: Record<string, string>[], options?: FormalTableOptions) {
    this.paintFlowingTable("", columns, rows, options);
  }

  addSectionTable(title: string, columns: TableColumn[], rows: Record<string, string>[], options?: FormalTableOptions) {
    this.paintFlowingTable(title, columns, rows, options);
  }

  addFlowingSectionTable(
    title: string,
    columns: TableColumn[],
    rows: Record<string, string>[],
    options?: FormalTableOptions,
  ) {
    this.paintFlowingTable(title, columns, rows, options);
  }

  private paintFlowingTable(
    title: string,
    columns: TableColumn[],
    rows: Record<string, string>[],
    options?: FormalTableOptions,
  ) {
    const scaled = scaleColumns(columns, this.contentW);
    const headerLines = scaled.map((col) => wrapPdfLines(col.label, col.width, HEADER_SIZE, true, 2));
    const headerH = Math.max(18, ...headerLines.map((lines) => 6 + lines.length * 8));
    const prepared = prepareRows(scaled, rows, options);
    const empty = prepared.length === 0;
    if (title) this.continuingSection = title;

    let index = 0;
    let first = true;
    const minY = this.marginBottom + 14;

    while (first || index < prepared.length) {
      if (title) {
        this.ensureSpace(headerH + 40, title);
        if (first) {
          this.page.ops.push(`${FORMAL_INK} rg`);
          this.page.ops.push(pdfText("F2", 10, this.marginX, this.page.y, title));
          this.page.y -= 12;
          if (options?.subtitle) {
            this.page.ops.push(`${FORMAL_MUTED} rg`);
            this.page.ops.push(pdfText("F1", 7.5, this.marginX, this.page.y, pdfAscii(options.subtitle)));
            this.page.y -= 12;
          }
        }
      } else {
        this.ensureSpace(headerH + 28);
      }

      const top = this.page.y;
      let used = headerH;
      let end = index;
      if (empty) used += 22;
      while (end < prepared.length) {
        const next = prepared[end].height;
        if (top - used - next < minY) break;
        used += next;
        end += 1;
      }
      if (!empty && end === index) {
        end = index + 1;
        used += prepared[index].height;
      }

      const tableH = used;
      const tableBottom = top - tableH;
      const x = this.marginX;
      const frame = pdfRoundPath(x, tableBottom, this.contentW, tableH, FORMAL_RADIUS);
      this.page.ops.push(`${FORMAL_WHITE} rg`);
      this.page.ops.push(`${FORMAL_STROKE} RG`);
      this.page.ops.push("0.45 w");
      this.page.ops.push(`${frame} B`);

      const headerY = top - headerH;
      this.page.ops.push(`${FORMAL_HEADER} rg`);
      this.page.ops.push(
        `${x.toFixed(2)} ${headerY.toFixed(2)} ${this.contentW.toFixed(2)} ${headerH.toFixed(2)} re f`,
      );
      this.page.ops.push(`${FORMAL_STROKE} RG`);
      this.page.ops.push(pdfLine(x, headerY, x + this.contentW, headerY, 0.4));
      let cx = x;
      scaled.forEach((col, colIndex) => {
        drawClippedPdfLines(this.page.ops, "F2", HEADER_SIZE, cx, headerY, col.width, headerH, headerLines[colIndex], col.align ?? "left");
        cx += col.width;
      });

      let ry = headerY;
      if (empty) {
        const emptyY = ry - 22;
        this.page.ops.push(`${FORMAL_STROKE} RG`);
        this.page.ops.push(pdfLine(x, emptyY, x + this.contentW, emptyY, 0.35));
        drawClippedPdfLines(
          this.page.ops,
          "F1",
          8,
          x,
          emptyY,
          this.contentW,
          22,
          [options?.emptyMessage ?? "No matching records for the selected filters."],
          "left",
          FORMAL_MUTED,
        );
        ry = emptyY;
      } else {
        for (const row of prepared.slice(index, end)) {
          const nextY = ry - row.height;
          if (row.tint) {
            this.page.ops.push(`${FORMAL_HEADER} rg`);
            this.page.ops.push(
              `${x.toFixed(2)} ${nextY.toFixed(2)} ${this.contentW.toFixed(2)} ${row.height.toFixed(2)} re f`,
            );
          }
          this.page.ops.push(`${FORMAL_STROKE} RG`);
          this.page.ops.push(pdfLine(x, nextY, x + this.contentW, nextY, 0.32));
          let colX = x;
          for (const col of scaled) {
            drawClippedPdfLines(
              this.page.ops,
              row.bold ? "F2" : "F1",
              BODY_SIZE,
              colX,
              nextY,
              col.width,
              row.height,
              row.lines[col.key] ?? ["—"],
              col.align ?? "left",
            );
            colX += col.width;
          }
          ry = nextY;
        }
      }

      let dividerX = x;
      for (let colIndex = 0; colIndex < scaled.length - 1; colIndex += 1) {
        dividerX += scaled[colIndex].width;
        this.page.ops.push(`${FORMAL_STROKE} RG`);
        this.page.ops.push(pdfLine(dividerX, tableBottom, dividerX, top, 0.32));
      }
      this.page.ops.push(`${FORMAL_STROKE} RG`);
      this.page.ops.push("0.45 w");
      this.page.ops.push(`${frame} S`);

      this.page.y = tableBottom - 12;
      first = false;
      index = end;
      if (empty) break;
    }
  }

  addTwoColumnSections(
    left: {
      title: string;
      columns: TableColumn[];
      rows: Record<string, string>[];
      totalRow?: Record<string, string>;
    },
    right: {
      title: string;
      columns: TableColumn[];
      rows: Record<string, string>[];
      totalRow?: Record<string, string>;
    },
  ) {
    const gap = 10;
    const colW = (this.contentW - gap) / 2;
    const measure = (block: typeof left) => {
      const scaled = scaleColumns(block.columns, colW);
      const headerLines = scaled.map((col) => wrapPdfLines(col.label, col.width, HEADER_SIZE, true, 2));
      const headerH = Math.max(16, ...headerLines.map((lines) => 6 + lines.length * 8));
      const prepared = prepareRows(scaled, block.rows, { totalRow: block.totalRow });
      const body = prepared.reduce((sum, row) => sum + row.height, 0) || 22;
      return { scaled, headerLines, headerH, prepared, height: 14 + headerH + body };
    };
    const leftM = measure(left);
    const rightM = measure(right);
    const needed = Math.max(leftM.height, rightM.height) + 8;
    if (this.page.y - needed < this.marginBottom + 14) {
      this.addSectionTable(left.title, left.columns, left.rows, { totalRow: left.totalRow });
      this.addSectionTable(right.title, right.columns, right.rows, { totalRow: right.totalRow });
      return;
    }

    const startY = this.page.y;
    const paint = (
      x: number,
      title: string,
      measured: ReturnType<typeof measure>,
      blockH: number,
    ) => {
      this.page.ops.push(`${FORMAL_INK} rg`);
      this.page.ops.push(pdfText("F2", 10, x, startY, title));
      const tableTop = startY - 14;
      const tableH = blockH - 14;
      const tableBottom = tableTop - tableH;
      const frame = pdfRoundPath(x, tableBottom, colW, tableH, FORMAL_RADIUS);
      this.page.ops.push(`${FORMAL_WHITE} rg`);
      this.page.ops.push(`${FORMAL_STROKE} RG`);
      this.page.ops.push("0.45 w");
      this.page.ops.push(`${frame} B`);
      const headerY = tableTop - measured.headerH;
      this.page.ops.push(`${FORMAL_HEADER} rg`);
      this.page.ops.push(`${x.toFixed(2)} ${headerY.toFixed(2)} ${colW.toFixed(2)} ${measured.headerH.toFixed(2)} re f`);
      this.page.ops.push(`${FORMAL_STROKE} RG`);
      this.page.ops.push(pdfLine(x, headerY, x + colW, headerY, 0.4));
      let cx = x;
      measured.scaled.forEach((col, colIndex) => {
        drawClippedPdfLines(
          this.page.ops,
          "F2",
          HEADER_SIZE,
          cx,
          headerY,
          col.width,
          measured.headerH,
          measured.headerLines[colIndex],
          col.align ?? "left",
        );
        cx += col.width;
      });
      let ry = headerY;
      if (!measured.prepared.length) {
        const emptyY = ry - 22;
        this.page.ops.push(`${FORMAL_STROKE} RG`);
        this.page.ops.push(pdfLine(x, emptyY, x + colW, emptyY, 0.32));
        drawClippedPdfLines(this.page.ops, "F1", 8, x, emptyY, colW, 22, ["No records."], "left", FORMAL_MUTED);
      } else {
        for (const row of measured.prepared) {
          const nextY = ry - row.height;
          if (row.tint) {
            this.page.ops.push(`${FORMAL_HEADER} rg`);
            this.page.ops.push(`${x.toFixed(2)} ${nextY.toFixed(2)} ${colW.toFixed(2)} ${row.height.toFixed(2)} re f`);
          }
          this.page.ops.push(`${FORMAL_STROKE} RG`);
          this.page.ops.push(pdfLine(x, nextY, x + colW, nextY, 0.32));
          let colX = x;
          for (const col of measured.scaled) {
            drawClippedPdfLines(
              this.page.ops,
              row.bold ? "F2" : "F1",
              BODY_SIZE,
              colX,
              nextY,
              col.width,
              row.height,
              row.lines[col.key] ?? ["—"],
              col.align ?? "left",
            );
            colX += col.width;
          }
          ry = nextY;
        }
      }
      let dividerX = x;
      for (let colIndex = 0; colIndex < measured.scaled.length - 1; colIndex += 1) {
        dividerX += measured.scaled[colIndex].width;
        this.page.ops.push(`${FORMAL_STROKE} RG`);
        this.page.ops.push(pdfLine(dividerX, tableBottom, dividerX, tableTop, 0.32));
      }
      this.page.ops.push(`${FORMAL_STROKE} RG`);
      this.page.ops.push("0.45 w");
      this.page.ops.push(`${frame} S`);
    };

    const blockH = Math.max(leftM.height, rightM.height);
    paint(this.marginX, left.title, leftM, blockH);
    paint(this.marginX + colW + gap, right.title, rightM, blockH);
    this.page.y = startY - blockH - 12;
  }

  addReportNote(note: string) {
    const lines = wrapPdfLines(note, this.contentW - 16, 7.5, false, 8);
    const h = 18 + lines.length * 10 + 8;
    this.ensureSpace(h + 8);
    const y = this.page.y - h;
    const path = pdfRoundPath(this.marginX, y, this.contentW, h, FORMAL_RADIUS);
    this.page.ops.push(`${FORMAL_WHITE} rg`);
    this.page.ops.push(`${FORMAL_STROKE} RG`);
    this.page.ops.push("0.45 w");
    this.page.ops.push(`${path} B`);
    this.page.ops.push(`${FORMAL_INK} rg`);
    this.page.ops.push(pdfText("F2", 8.5, this.marginX + 8, y + h - 12, "Report note"));
    lines.forEach((line, index) => {
      this.page.ops.push(`${FORMAL_MUTED} rg`);
      this.page.ops.push(pdfText("F1", 7.5, this.marginX + 8, y + h - 24 - index * 10, line));
    });
    this.page.y = y - 10;
  }

  build() {
    if (this.meta.filtersNote) this.addReportNote(this.meta.filtersNote);
    const count = this.pages.length;
    const footer = pdfAscii(this.meta.footerLeft || this.brand());
    this.pages.forEach((page, index) => {
      page.ops.push(`${FORMAL_STROKE} RG`);
      page.ops.push(pdfLine(this.marginX, 18, this.pageW - this.marginX, 18, 0.4));
      page.ops.push(`${FORMAL_MUTED} rg`);
      page.ops.push(pdfText("F1", 7.5, this.marginX, 8, footer));
      const pageLabel = `Page ${index + 1} of ${count}`;
      page.ops.push(
        pdfText("F1", 7.5, this.pageW - this.marginX - formalTextWidth(pageLabel, 7.5), 8, pageLabel),
      );
    });
    return buildOrientedPdf(
      this.pages.map((page) => page.ops.join("\n")),
      this.pageW,
      this.pageH,
    );
  }
}
