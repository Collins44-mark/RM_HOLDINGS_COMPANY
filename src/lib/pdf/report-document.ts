import { APP_NAME, APP_TAGLINE } from "@/lib/config/app";

export const PAGE_W = 595;
export const PAGE_H = 842;
export const MARGIN_X = 42;
export const MARGIN_TOP = 40;
export const MARGIN_BOTTOM = 72;
export const CONTENT_W = PAGE_W - MARGIN_X * 2;
export const COL_GAP = 14;
export const COL_W = (CONTENT_W - COL_GAP) / 2;

/** Light blue-gray used for section bars, table headers, and total rows */
export const FILL_HEADER = "0.922 0.949 0.969";
export const STROKE = "0.78 0.82 0.86";
export const INK = "0.05 0.12 0.22";
export const MUTED = "0.45 0.50 0.56";

export type PdfFont = "F1" | "F2";
export type PdfAlign = "left" | "right" | "center";

export type ReportDocMeta = {
  businessUnit: string;
  title: string;
  subtitle: string;
  periodLabel: string;
  periodDates: string;
  generatedAt: string;
  preparedBy?: string;
  preparedRole?: string;
  filtersNote?: string;
};

export type TableColumn = {
  key: string;
  label: string;
  width: number;
  align?: PdfAlign;
};

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function pdfAscii(value: string) {
  return value.replace(/[^\x20-\x7E]/g, (char) => {
    if (char === "–" || char === "—" || char === "−") return "-";
    if (char === "•") return "-";
    return " ";
  });
}

export function pdfText(font: PdfFont, size: number, x: number, y: number, value: string) {
  return `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(pdfAscii(value))}) Tj ET`;
}

export function pdfLine(x1: number, y1: number, x2: number, y2: number, width = 0.5) {
  return `${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`;
}

export function pdfFillRect(x: number, y: number, w: number, h: number, color: string) {
  return `${color} ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`;
}

export function pdfStrokeRect(x: number, y: number, w: number, h: number, width = 0.5) {
  return `${width} w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`;
}

export function pdfClip(value: string, max: number) {
  const textValue = pdfAscii(value);
  return textValue.length > max ? `${textValue.slice(0, Math.max(0, max - 3))}...` : textValue;
}

/** Approximate Helvetica string width in points */
export function pdfTextWidth(value: string, size: number, bold = false) {
  const factor = bold ? 0.55 : 0.5;
  return pdfAscii(value).length * size * factor;
}

export function pdfAlignedText(
  font: PdfFont,
  size: number,
  x: number,
  y: number,
  width: number,
  value: string,
  align: PdfAlign = "left",
) {
  const textValue = pdfAscii(value);
  const bold = font === "F2";
  const tw = pdfTextWidth(textValue, size, bold);
  let drawX = x + 4;
  if (align === "right") drawX = x + width - tw - 4;
  if (align === "center") drawX = x + (width - tw) / 2;
  return pdfText(font, size, Math.max(x + 2, drawX), y, textValue);
}

export function formatPdfNumber(amount: number) {
  return new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(Math.round(amount));
}

export function formatPdfPercent(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export function formatPdfGeneratedAt(date = new Date()) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(date.getDate()).padStart(2, "0");
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${day} ${month} ${year} ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}

export function buildPdfBytes(pageStreams: string[]) {
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
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`,
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
  chunks.push(
    xrefTable,
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
  );
  return new TextEncoder().encode(chunks.join(""));
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

type PageState = {
  ops: string[];
  y: number;
};

export class ReportDocument {
  private pages: PageState[] = [];
  private page: PageState;
  private meta: ReportDocMeta;
  private continuingSection: string | null = null;

  constructor(meta: ReportDocMeta) {
    this.meta = {
      preparedBy: "System User",
      preparedRole: "System Administrator",
      ...meta,
    };
    this.page = { ops: [], y: PAGE_H - MARGIN_TOP };
    this.pages.push(this.page);
    this.drawDocumentHeader(true);
  }

  private setInk(color = INK) {
    this.page.ops.push(`${color} rg`);
  }

  private setStroke(color = STROKE) {
    this.page.ops.push(`${color} RG`);
  }

  private drawDocumentHeader(full: boolean) {
    const yTop = PAGE_H - MARGIN_TOP;
    this.setInk(INK);
    this.page.ops.push(pdfText("F2", 14, MARGIN_X, yTop - 2, APP_NAME));
    this.page.ops.push(pdfText("F1", 9, MARGIN_X, yTop - 16, this.meta.businessUnit));

    const tagLine1 = APP_TAGLINE.includes("•")
      ? APP_TAGLINE
      : "One Vision - Multiple Opportunities";
    const tagLine2 = "A Greater Tomorrow";
    this.setInk(MUTED);
    const t1w = pdfTextWidth(tagLine1, 8);
    const t2w = pdfTextWidth(tagLine2, 8);
    this.page.ops.push(pdfText("F1", 8, PAGE_W - MARGIN_X - t1w, yTop - 2, tagLine1));
    this.page.ops.push(pdfText("F1", 8, PAGE_W - MARGIN_X - t2w, yTop - 14, tagLine2));

    this.setStroke(STROKE);
    this.page.ops.push(pdfLine(MARGIN_X, yTop - 26, PAGE_W - MARGIN_X, yTop - 26, 0.6));
    this.page.y = yTop - 40;

    if (!full) {
      if (this.continuingSection) {
        this.setInk(INK);
        this.page.ops.push(pdfText("F2", 10, MARGIN_X, this.page.y, `${this.continuingSection} (continued)`));
        this.page.y -= 16;
      }
      return;
    }

    this.setInk(INK);
    this.page.ops.push(pdfText("F2", 18, MARGIN_X, this.page.y, this.meta.title));
    this.page.y -= 14;
    this.setInk(MUTED);
    this.page.ops.push(pdfText("F1", 9, MARGIN_X, this.page.y, this.meta.subtitle));

    const metaTop = PAGE_H - MARGIN_TOP - 40;
    this.setInk(MUTED);
    const periodLabelW = pdfTextWidth("Report Period", 8);
    this.page.ops.push(pdfText("F1", 8, PAGE_W - MARGIN_X - periodLabelW, metaTop, "Report Period"));
    this.setInk(INK);
    const dates = this.meta.periodDates || this.meta.periodLabel;
    const datesW = pdfTextWidth(dates, 10, true);
    this.page.ops.push(pdfText("F2", 10, PAGE_W - MARGIN_X - datesW, metaTop - 14, dates));
    this.setInk(MUTED);
    const rangeW = pdfTextWidth(this.meta.periodLabel, 9);
    this.page.ops.push(pdfText("F1", 9, PAGE_W - MARGIN_X - rangeW, metaTop - 28, this.meta.periodLabel));
    const generated = `Generated on: ${this.meta.generatedAt}`;
    const genW = pdfTextWidth(generated, 8);
    this.page.ops.push(pdfText("F1", 8, PAGE_W - MARGIN_X - genW, metaTop - 44, generated));

    this.page.y = Math.min(this.page.y - 8, metaTop - 58);
  }

  private newPage(sectionTitle?: string) {
    if (sectionTitle) this.continuingSection = sectionTitle;
    this.page = { ops: [], y: PAGE_H - MARGIN_TOP };
    this.pages.push(this.page);
    this.drawDocumentHeader(false);
  }

  private ensureSpace(needed: number, sectionTitle?: string) {
    if (this.page.y - needed < MARGIN_BOTTOM) {
      this.newPage(sectionTitle);
    }
  }

  addSectionTitle(title: string) {
    this.ensureSpace(28, title);
    this.continuingSection = title;
    const h = 18;
    const y = this.page.y - h;
    this.page.ops.push(pdfFillRect(MARGIN_X, y, CONTENT_W, h, FILL_HEADER));
    this.setInk(INK);
    this.page.ops.push(pdfText("F2", 10, MARGIN_X + 8, y + 5.5, title));
    this.page.y = y - 10;
  }

  /** Simpler bordered table without fragile outer rect */
  addSimpleTable(
    columns: TableColumn[],
    rows: Record<string, string>[],
    options?: {
      sectionTitle?: string;
      x?: number;
      width?: number;
      totalRow?: Record<string, string>;
    },
  ) {
    const x = options?.x ?? MARGIN_X;
    const width = options?.width ?? CONTENT_W;
    const rowH = 15;
    const headerH = 14;
    const sectionTitle = options?.sectionTitle;

    const drawHeader = () => {
      const hy = this.page.y - headerH;
      this.page.ops.push(pdfFillRect(x, hy, width, headerH, FILL_HEADER));
      this.setStroke(STROKE);
      this.page.ops.push(pdfLine(x, hy + headerH, x + width, hy + headerH, 0.45));
      this.page.ops.push(pdfLine(x, hy, x + width, hy, 0.45));
      this.setInk(INK);
      let cx = x;
      for (const col of columns) {
        this.page.ops.push(
          pdfAlignedText("F2", 7.5, cx, hy + 4, col.width, col.label, col.align ?? "left"),
        );
        cx += col.width;
      }
      this.page.y = hy;
    };

    this.ensureSpace(headerH + rowH * 2, sectionTitle);
    drawHeader();

    const paintRow = (row: Record<string, string>, bold = false, tint = false) => {
      if (this.page.y - rowH < MARGIN_BOTTOM) {
        this.newPage(sectionTitle);
        drawHeader();
      }
      const ry = this.page.y - rowH;
      if (tint) this.page.ops.push(pdfFillRect(x, ry, width, rowH, FILL_HEADER));
      this.setStroke(STROKE);
      this.page.ops.push(pdfLine(x, ry, x + width, ry, 0.35));
      this.setInk(INK);
      let cx = x;
      for (const col of columns) {
        this.page.ops.push(
          pdfAlignedText(bold ? "F2" : "F1", 8, cx, ry + 4, col.width, row[col.key] ?? "", col.align ?? "left"),
        );
        cx += col.width;
      }
      this.page.y = ry;
    };

    for (const row of rows) paintRow(row);
    if (options?.totalRow) paintRow(options.totalRow, true, true);
    this.page.y -= 12;
  }

  addTwoColumnTables(
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
    const rowH = 15;
    const headerH = 14;
    const titleBlock = 28;
    const leftRows = left.rows.length + (left.totalRow ? 1 : 0);
    const rightRows = right.rows.length + (right.totalRow ? 1 : 0);
    const needed =
      titleBlock + headerH + rowH * Math.max(leftRows, rightRows) + 16;

    // If not enough room for both columns side-by-side, stack full-width.
    if (this.page.y - needed < MARGIN_BOTTOM) {
      this.addSectionTitle(left.title);
      this.addSimpleTable(left.columns, left.rows, {
        sectionTitle: left.title,
        totalRow: left.totalRow,
      });
      this.addSectionTitle(right.title);
      this.addSimpleTable(right.columns, right.rows, {
        sectionTitle: right.title,
        totalRow: right.totalRow,
      });
      return;
    }

    const startY = this.page.y;
    const leftX = MARGIN_X;
    const rightX = MARGIN_X + COL_W + COL_GAP;

    const renderBlock = (
      x: number,
      block: {
        title: string;
        columns: TableColumn[];
        rows: Record<string, string>[];
        totalRow?: Record<string, string>;
      },
    ) => {
      let y = startY;
      const titleH = 18;
      const titleY = y - titleH;
      this.page.ops.push(pdfFillRect(x, titleY, COL_W, titleH, FILL_HEADER));
      this.setInk(INK);
      this.page.ops.push(pdfText("F2", 9, x + 6, titleY + 5.5, block.title));
      y = titleY - 8;

      const hy = y - headerH;
      this.page.ops.push(pdfFillRect(x, hy, COL_W, headerH, FILL_HEADER));
      this.setStroke(STROKE);
      this.page.ops.push(pdfLine(x, hy + headerH, x + COL_W, hy + headerH, 0.45));
      this.page.ops.push(pdfLine(x, hy, x + COL_W, hy, 0.45));
      this.setInk(INK);
      let cx = x;
      for (const col of block.columns) {
        this.page.ops.push(
          pdfAlignedText("F2", 7, cx, hy + 4, col.width, col.label, col.align ?? "left"),
        );
        cx += col.width;
      }
      y = hy;

      const paint = (row: Record<string, string>, bold = false, tint = false) => {
        const ry = y - rowH;
        if (tint) this.page.ops.push(pdfFillRect(x, ry, COL_W, rowH, FILL_HEADER));
        this.setStroke(STROKE);
        this.page.ops.push(pdfLine(x, ry, x + COL_W, ry, 0.35));
        this.setInk(INK);
        let colX = x;
        for (const col of block.columns) {
          this.page.ops.push(
            pdfAlignedText(
              bold ? "F2" : "F1",
              7.5,
              colX,
              ry + 4,
              col.width,
              row[col.key] ?? "",
              col.align ?? "left",
            ),
          );
          colX += col.width;
        }
        y = ry;
      };

      for (const row of block.rows) paint(row);
      if (block.totalRow) paint(block.totalRow, true, true);
      return y;
    };

    const leftEnd = renderBlock(leftX, left);
    const rightEnd = renderBlock(rightX, right);
    this.page.y = Math.min(leftEnd, rightEnd) - 14;
  }

  addReportNote(note: string) {
    this.ensureSpace(36);
    const h = 28;
    const y = this.page.y - h;
    this.page.ops.push(pdfFillRect(MARGIN_X, y, CONTENT_W, h, FILL_HEADER));
    this.setStroke("0.70 0.78 0.86");
    this.page.ops.push(pdfStrokeRect(MARGIN_X, y, CONTENT_W, h, 0.6));
    this.setInk(INK);
    this.page.ops.push(pdfText("F2", 8, MARGIN_X + 8, y + h - 12, "Report Note"));
    this.setInk(MUTED);
    // Wrap note roughly
    const maxChars = 95;
    const lines: string[] = [];
    const words = pdfAscii(note).split(" ");
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars) {
        if (current) lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) lines.push(current);
    lines.slice(0, 2).forEach((line, index) => {
      this.page.ops.push(pdfText("F1", 7.5, MARGIN_X + 78, y + h - 12 - index * 10, line));
    });
    this.page.y = y - 14;
  }

  private drawFooters() {
    const count = this.pages.length;
    this.pages.forEach((page, index) => {
      page.ops.push(`${STROKE} RG`);
      page.ops.push(pdfLine(MARGIN_X, 52, PAGE_W - MARGIN_X, 52, 0.5));
      page.ops.push(`${MUTED} rg`);
      page.ops.push(pdfText("F1", 7.5, MARGIN_X, 38, "Prepared by:"));
      page.ops.push(`${INK} rg`);
      page.ops.push(pdfText("F2", 9, MARGIN_X, 26, this.meta.preparedBy ?? "System User"));
      page.ops.push(`${MUTED} rg`);
      page.ops.push(pdfText("F1", 7.5, MARGIN_X, 14, this.meta.preparedRole ?? "System Administrator"));

      const brand = APP_NAME;
      const unit = this.meta.businessUnit;
      page.ops.push(`${INK} rg`);
      page.ops.push(pdfText("F2", 9, PAGE_W - MARGIN_X - pdfTextWidth(brand, 9, true), 26, brand));
      page.ops.push(`${MUTED} rg`);
      page.ops.push(pdfText("F1", 7.5, PAGE_W - MARGIN_X - pdfTextWidth(unit, 7.5), 14, unit));

      const pageLabel = `Page ${index + 1} of ${count}`;
      page.ops.push(
        pdfText("F1", 7.5, PAGE_W / 2 - pdfTextWidth(pageLabel, 7.5) / 2, 14, pageLabel),
      );
    });
  }

  build() {
    if (this.meta.filtersNote) {
      this.addReportNote(this.meta.filtersNote);
    }
    this.drawFooters();
    return buildPdfBytes(this.pages.map((page) => page.ops.join("\n")));
  }
}
