import { APP_NAME, APP_TAGLINE } from "@/lib/config/app";
import {
  COL_GAP,
  COL_W,
  CONTENT_W,
  MARGIN_BOTTOM,
  MARGIN_TOP,
  MARGIN_X,
  MUTED,
  PAGE_H,
  PAGE_W,
  buildPdfBytes,
  pdfAlignedText,
  pdfAscii,
  pdfClip,
  pdfLine,
  pdfText,
  pdfTextWidth,
  type ReportDocMeta,
  type TableColumn,
} from "@/lib/pdf/report-document";

/** Subtle light blue-grey — table headers only (never dark bars) */
const FILL_HEAD = "0.945 0.957 0.969";
/** Slightly deeper tint for total rows */
const FILL_TOTAL = "0.922 0.938 0.953";
/** Report note panel */
const FILL_NOTE = "0.949 0.960 0.973";
/** Soft container border */
const BORDER = "0.84 0.87 0.90";
const DIVIDER = "0.70 0.73 0.76";
const INK = "0.06 0.12 0.20";
const SECTION_RADIUS = 7;
const PAD_X = 10;

function pdfRoundRectPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  const k = 0.5522847498 * rr;
  const x0 = x;
  const y0 = y;
  const x1 = x + w;
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
  ].join("\n");
}

function pdfFillRoundRect(x: number, y: number, w: number, h: number, r: number, color: string) {
  return `${color} rg\n${pdfRoundRectPath(x, y, w, h, r)}\nf`;
}

function pdfStrokeRoundRect(x: number, y: number, w: number, h: number, r: number, width = 0.55) {
  return `${width} w\n${pdfRoundRectPath(x, y, w, h, r)}\nS`;
}

function wrapText(note: string, maxChars: number) {
  const lines: string[] = [];
  const words = pdfAscii(note).split(" ");
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

type PageState = { ops: string[]; y: number };

/**
 * Corporate A4 Sales Report — white rounded sections, light table headers only.
 * No dark bars, icons, or dashboard chrome.
 */
export class CorporateSalesDocument {
  private pages: PageState[] = [];
  private page: PageState;
  private meta: ReportDocMeta;
  private continuingSection: string | null = null;

  constructor(meta: ReportDocMeta) {
    this.meta = {
      preparedBy: "Collins Sarungi",
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

  private setStroke(color = BORDER) {
    this.page.ops.push(`${color} RG`);
  }

  private drawDocumentHeader(full: boolean) {
    const yTop = PAGE_H - MARGIN_TOP;
    this.setInk(INK);
    this.page.ops.push(pdfText("F2", 13, MARGIN_X, yTop - 2, APP_NAME));
    this.setInk(MUTED);
    this.page.ops.push(pdfText("F1", 9, MARGIN_X, yTop - 15, this.meta.businessUnit));

    const tagLine1 = APP_TAGLINE.includes("•")
      ? APP_TAGLINE
      : "One Vision - Multiple Opportunities";
    const tagLine2 = "A Greater Tomorrow";
    this.setInk(MUTED);
    this.page.ops.push(
      pdfText("F1", 8, PAGE_W - MARGIN_X - pdfTextWidth(tagLine1, 8), yTop - 2, tagLine1),
    );
    this.page.ops.push(
      pdfText("F1", 8, PAGE_W - MARGIN_X - pdfTextWidth(tagLine2, 8), yTop - 14, tagLine2),
    );

    this.setStroke(DIVIDER);
    this.page.ops.push(pdfLine(MARGIN_X, yTop - 24, PAGE_W - MARGIN_X, yTop - 24, 0.45));
    this.page.y = yTop - 40;

    if (!full) {
      if (this.continuingSection) {
        this.setInk(INK);
        this.page.ops.push(
          pdfText("F2", 9.5, MARGIN_X, this.page.y, `${this.continuingSection} (continued)`),
        );
        this.page.y -= 16;
      }
      return;
    }

    this.setInk(INK);
    this.page.ops.push(pdfText("F2", 20, MARGIN_X, this.page.y, this.meta.title));
    this.page.y -= 14;
    this.setInk(MUTED);
    this.page.ops.push(pdfText("F1", 9, MARGIN_X, this.page.y, this.meta.subtitle));

    const metaTop = PAGE_H - MARGIN_TOP - 40;
    this.setInk(MUTED);
    const periodCaption = "Report Period";
    this.page.ops.push(
      pdfText("F1", 8, PAGE_W - MARGIN_X - pdfTextWidth(periodCaption, 8), metaTop, periodCaption),
    );
    this.setInk(INK);
    const dates = this.meta.periodDates || this.meta.periodLabel;
    this.page.ops.push(
      pdfText("F2", 10, PAGE_W - MARGIN_X - pdfTextWidth(dates, 10, true), metaTop - 13, dates),
    );
    this.setInk(MUTED);
    this.page.ops.push(
      pdfText(
        "F1",
        9,
        PAGE_W - MARGIN_X - pdfTextWidth(this.meta.periodLabel, 9),
        metaTop - 26,
        this.meta.periodLabel,
      ),
    );
    const generated = `Generated on: ${this.meta.generatedAt}`;
    this.page.ops.push(
      pdfText("F1", 7.5, PAGE_W - MARGIN_X - pdfTextWidth(generated, 7.5), metaTop - 40, generated),
    );

    this.page.y = Math.min(this.page.y - 12, metaTop - 56);
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

  private paintTable(
    tableX: number,
    startY: number,
    tableW: number,
    columns: TableColumn[],
    rows: Record<string, string>[],
    totalRow: Record<string, string> | undefined,
    headerH: number,
    rowH: number,
    fontSize: number,
  ) {
    const scale = tableW / columns.reduce((sum, col) => sum + col.width, 0);
    const scaled = columns.map((col) => ({ ...col, width: col.width * scale }));

    let y = startY;
    const hy = y - headerH;
    this.page.ops.push(
      `${FILL_HEAD} rg ${tableX.toFixed(2)} ${hy.toFixed(2)} ${tableW.toFixed(2)} ${headerH.toFixed(2)} re f`,
    );
    this.setStroke(BORDER);
    this.page.ops.push(pdfLine(tableX, hy, tableX + tableW, hy, 0.35));
    this.setInk(INK);
    let cx = tableX;
    for (const col of scaled) {
      this.page.ops.push(
        pdfAlignedText("F2", fontSize - 0.5, cx, hy + 4.2, col.width, col.label, col.align ?? "left"),
      );
      cx += col.width;
    }
    y = hy;

    const paintRow = (row: Record<string, string>, bold = false, tint = false) => {
      const ry = y - rowH;
      if (tint) {
        this.page.ops.push(
          `${FILL_TOTAL} rg ${tableX.toFixed(2)} ${ry.toFixed(2)} ${tableW.toFixed(2)} ${rowH.toFixed(2)} re f`,
        );
      }
      this.setStroke(BORDER);
      this.page.ops.push(pdfLine(tableX, ry, tableX + tableW, ry, 0.3));
      this.setInk(INK);
      let colX = tableX;
      for (const col of scaled) {
        const emphasize = bold || col.align === "right";
        this.page.ops.push(
          pdfAlignedText(
            emphasize ? "F2" : "F1",
            fontSize,
            colX,
            ry + 4.2,
            col.width,
            pdfClip(row[col.key] ?? "", Math.max(6, Math.floor(col.width / 3.5))),
            col.align ?? "left",
          ),
        );
        colX += col.width;
      }
      y = ry;
    };

    for (const row of rows) paintRow(row);
    if (totalRow) paintRow(totalRow, true, true);
    return y;
  }

  /** White rounded section with soft light title strip + clean table */
  addSectionTable(
    title: string,
    columns: TableColumn[],
    rows: Record<string, string>[],
    options?: { totalRow?: Record<string, string> },
  ) {
    const titleH = 18;
    const headerH = 15;
    const rowH = 16;
    const bodyRows = rows.length + (options?.totalRow ? 1 : 0);
    const bottomPad = 8;
    const tableW = CONTENT_W - PAD_X * 2;
    const sectionH = titleH + 4 + headerH + rowH * bodyRows + bottomPad;
    const needed = sectionH + 12;

    this.ensureSpace(needed, title);
    this.continuingSection = title;

    const boxTop = this.page.y;
    const boxBottom = boxTop - sectionH;
    const boxX = MARGIN_X;

    this.setStroke(BORDER);
    this.page.ops.push(pdfStrokeRoundRect(boxX, boxBottom, CONTENT_W, sectionH, SECTION_RADIUS, 0.55));

    // Very light section title strip (never dark / never thick bars)
    const titleY = boxTop - titleH;
    this.page.ops.push(
      pdfFillRoundRect(boxX + 0.4, titleY, CONTENT_W - 0.8, titleH, SECTION_RADIUS - 1, FILL_HEAD),
    );
    this.page.ops.push(
      `${FILL_HEAD} rg ${(boxX + 0.4).toFixed(2)} ${titleY.toFixed(2)} ${(CONTENT_W - 0.8).toFixed(2)} 5 re f`,
    );
    this.setInk(INK);
    this.page.ops.push(pdfText("F2", 10, boxX + PAD_X, titleY + 5.5, title));

    const tableX = boxX + PAD_X;
    this.paintTable(
      tableX,
      titleY - 2,
      tableW,
      columns,
      rows,
      options?.totalRow,
      headerH,
      rowH,
      8,
    );

    this.page.y = boxBottom - 12;
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
    const titleH = 17;
    const headerH = 14;
    const rowH = 15;
    const padX = 8;
    const bottomPad = 7;
    const leftRows = left.rows.length + (left.totalRow ? 1 : 0);
    const rightRows = right.rows.length + (right.totalRow ? 1 : 0);
    const maxRows = Math.max(leftRows, rightRows);
    const sectionH = titleH + 3 + headerH + rowH * maxRows + bottomPad;
    const needed = sectionH + 12;

    if (this.page.y - needed < MARGIN_BOTTOM) {
      this.addSectionTable(left.title, left.columns, left.rows, { totalRow: left.totalRow });
      this.addSectionTable(right.title, right.columns, right.rows, { totalRow: right.totalRow });
      return;
    }

    const startY = this.page.y;
    const leftX = MARGIN_X;
    const rightX = MARGIN_X + COL_W + COL_GAP;

    const render = (
      x: number,
      block: {
        title: string;
        columns: TableColumn[];
        rows: Record<string, string>[];
        totalRow?: Record<string, string>;
      },
    ) => {
      const boxBottom = startY - sectionH;
      this.setStroke(BORDER);
      this.page.ops.push(pdfStrokeRoundRect(x, boxBottom, COL_W, sectionH, SECTION_RADIUS, 0.55));

      const titleY = startY - titleH;
      this.page.ops.push(
        pdfFillRoundRect(x + 0.4, titleY, COL_W - 0.8, titleH, SECTION_RADIUS - 1, FILL_HEAD),
      );
      this.page.ops.push(
        `${FILL_HEAD} rg ${(x + 0.4).toFixed(2)} ${titleY.toFixed(2)} ${(COL_W - 0.8).toFixed(2)} 5 re f`,
      );
      this.setInk(INK);
      this.page.ops.push(pdfText("F2", 9, x + padX, titleY + 5, block.title));

      const tableX = x + padX;
      const tableW = COL_W - padX * 2;
      this.paintTable(
        tableX,
        titleY - 2,
        tableW,
        block.columns,
        block.rows,
        block.totalRow,
        headerH,
        rowH,
        7.2,
      );
    };

    render(leftX, left);
    render(rightX, right);
    this.page.y = startY - sectionH - 12;
  }

  addReportNote(note: string) {
    const lines = wrapText(note, 90);
    const lineH = 10;
    const titleGap = 12;
    const h = 14 + titleGap + lines.length * lineH + 10;
    this.ensureSpace(h + 8);

    const y = this.page.y - h;
    this.page.ops.push(pdfFillRoundRect(MARGIN_X, y, CONTENT_W, h, SECTION_RADIUS, FILL_NOTE));
    this.setStroke(BORDER);
    this.page.ops.push(pdfStrokeRoundRect(MARGIN_X, y, CONTENT_W, h, SECTION_RADIUS, 0.5));

    this.setInk(INK);
    this.page.ops.push(pdfText("F2", 9, MARGIN_X + 10, y + h - 13, "Report Note"));
    this.setInk(MUTED);
    lines.forEach((line, index) => {
      this.page.ops.push(
        pdfText("F1", 7.5, MARGIN_X + 10, y + h - 13 - titleGap - index * lineH, line),
      );
    });
    this.page.y = y - 10;
  }

  private drawFooters() {
    const count = this.pages.length;
    this.pages.forEach((page, index) => {
      page.ops.push(`${DIVIDER} RG`);
      page.ops.push(pdfLine(MARGIN_X, 50, PAGE_W - MARGIN_X, 50, 0.45));

      page.ops.push(`${MUTED} rg`);
      page.ops.push(pdfText("F1", 7.5, MARGIN_X, 36, "Prepared by:"));
      page.ops.push(`${INK} rg`);
      page.ops.push(pdfText("F2", 9, MARGIN_X, 24, this.meta.preparedBy ?? "Collins Sarungi"));
      page.ops.push(`${MUTED} rg`);
      page.ops.push(
        pdfText("F1", 7.5, MARGIN_X, 12, this.meta.preparedRole ?? "System Administrator"),
      );

      page.ops.push(`${INK} rg`);
      page.ops.push(
        pdfText("F2", 9, PAGE_W - MARGIN_X - pdfTextWidth(APP_NAME, 9, true), 24, APP_NAME),
      );
      page.ops.push(`${MUTED} rg`);
      page.ops.push(
        pdfText(
          "F1",
          7.5,
          PAGE_W - MARGIN_X - pdfTextWidth(this.meta.businessUnit, 7.5),
          12,
          this.meta.businessUnit,
        ),
      );

      if (count > 1) {
        const pageLabel = `Page ${index + 1} of ${count}`;
        page.ops.push(
          pdfText("F1", 7, PAGE_W / 2 - pdfTextWidth(pageLabel, 7) / 2, 12, pageLabel),
        );
      }
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

export type { TableColumn };
