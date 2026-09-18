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

/** Very light blue-grey — section titles & table headers */
const FILL_SOFT = "0.935 0.952 0.968";
/** Slightly deeper tint for total rows */
const FILL_TOTAL = "0.910 0.932 0.952";
/** Note panel fill */
const FILL_NOTE = "0.945 0.958 0.972";
/** Soft border */
const BORDER = "0.82 0.86 0.90";
const INK = "0.06 0.12 0.20";
const SECTION_RADIUS = 6;
const PAD = 8;

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

function pdfStrokeRoundRect(x: number, y: number, w: number, h: number, r: number, width = 0.6) {
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
 * Corporate A4 Sales Report builder — soft bordered sections, no dark bars/icons.
 * Used only by the Supermarket Sales Report PDF export.
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

    this.setStroke("0.72 0.76 0.80");
    this.page.ops.push(pdfLine(MARGIN_X, yTop - 24, PAGE_W - MARGIN_X, yTop - 24, 0.5));
    this.page.y = yTop - 38;

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

    const metaTop = PAGE_H - MARGIN_TOP - 38;
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

    this.page.y = Math.min(this.page.y - 10, metaTop - 54);
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

  /** Full-width bordered section with soft title bar + table */
  addSectionTable(
    title: string,
    columns: TableColumn[],
    rows: Record<string, string>[],
    options?: { totalRow?: Record<string, string> },
  ) {
    const titleH = 20;
    const headerH = 15;
    const rowH = 16;
    const bodyRows = rows.length + (options?.totalRow ? 1 : 0);
    const innerPad = PAD;
    const tableW = CONTENT_W - innerPad * 2;
    const sectionH = titleH + headerH + rowH * bodyRows + innerPad + 4;
    const needed = sectionH + 14;

    this.ensureSpace(needed, title);
    this.continuingSection = title;

    const boxTop = this.page.y;
    const boxBottom = boxTop - sectionH;
    const boxX = MARGIN_X;
    const boxW = CONTENT_W;

    // Outer soft container
    this.setStroke(BORDER);
    this.page.ops.push(pdfStrokeRoundRect(boxX, boxBottom, boxW, sectionH, SECTION_RADIUS, 0.65));

    // Soft title strip (clipped visually by drawing under the stroke)
    const titleY = boxTop - titleH;
    this.page.ops.push(pdfFillRoundRect(boxX + 0.5, titleY, boxW - 1, titleH, SECTION_RADIUS - 1, FILL_SOFT));
    // Cover bottom corners of title fill so only top is rounded visually
    this.page.ops.push(
      `${FILL_SOFT} rg ${(boxX + 0.5).toFixed(2)} ${titleY.toFixed(2)} ${(boxW - 1).toFixed(2)} 6 re f`,
    );
    this.setInk(INK);
    this.page.ops.push(pdfText("F2", 10, boxX + innerPad, titleY + 6, title));

    // Table header
    const tableX = boxX + innerPad;
    let y = titleY - 2;
    const hy = y - headerH;
    this.page.ops.push(
      `${FILL_SOFT} rg ${tableX.toFixed(2)} ${hy.toFixed(2)} ${tableW.toFixed(2)} ${headerH.toFixed(2)} re f`,
    );
    this.setStroke(BORDER);
    this.page.ops.push(pdfLine(tableX, hy + headerH, tableX + tableW, hy + headerH, 0.4));
    this.page.ops.push(pdfLine(tableX, hy, tableX + tableW, hy, 0.4));
    this.setInk(INK);
    let cx = tableX;
    const scale = tableW / columns.reduce((sum, col) => sum + col.width, 0);
    const scaled = columns.map((col) => ({ ...col, width: col.width * scale }));
    for (const col of scaled) {
      this.page.ops.push(
        pdfAlignedText("F2", 7.5, cx, hy + 4.5, col.width, col.label, col.align ?? "left"),
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
      this.page.ops.push(pdfLine(tableX, ry, tableX + tableW, ry, 0.35));
      this.setInk(INK);
      let colX = tableX;
      for (const col of scaled) {
        const emphasize = bold || col.align === "right";
        this.page.ops.push(
          pdfAlignedText(
            emphasize ? "F2" : "F1",
            8,
            colX,
            ry + 4.5,
            col.width,
            row[col.key] ?? "",
            col.align ?? "left",
          ),
        );
        colX += col.width;
      }
      y = ry;
    };

    for (const row of rows) paintRow(row);
    if (options?.totalRow) paintRow(options.totalRow, true, true);

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
    const titleH = 18;
    const headerH = 14;
    const rowH = 15;
    const innerPad = 6;
    const leftRows = left.rows.length + (left.totalRow ? 1 : 0);
    const rightRows = right.rows.length + (right.totalRow ? 1 : 0);
    const maxRows = Math.max(leftRows, rightRows);
    const sectionH = titleH + headerH + rowH * maxRows + innerPad + 4;
    const needed = sectionH + 14;

    if (this.page.y - needed < MARGIN_BOTTOM) {
      // Stack full-width when space is tight
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
      this.page.ops.push(pdfStrokeRoundRect(x, boxBottom, COL_W, sectionH, SECTION_RADIUS, 0.65));

      const titleY = startY - titleH;
      this.page.ops.push(
        pdfFillRoundRect(x + 0.5, titleY, COL_W - 1, titleH, SECTION_RADIUS - 1, FILL_SOFT),
      );
      this.page.ops.push(
        `${FILL_SOFT} rg ${(x + 0.5).toFixed(2)} ${titleY.toFixed(2)} ${(COL_W - 1).toFixed(2)} 5 re f`,
      );
      this.setInk(INK);
      this.page.ops.push(pdfText("F2", 9, x + innerPad, titleY + 5.5, block.title));

      const tableX = x + innerPad;
      const tableW = COL_W - innerPad * 2;
      let y = titleY - 1;
      const hy = y - headerH;
      this.page.ops.push(
        `${FILL_SOFT} rg ${tableX.toFixed(2)} ${hy.toFixed(2)} ${tableW.toFixed(2)} ${headerH.toFixed(2)} re f`,
      );
      this.setStroke(BORDER);
      this.page.ops.push(pdfLine(tableX, hy + headerH, tableX + tableW, hy + headerH, 0.35));
      this.page.ops.push(pdfLine(tableX, hy, tableX + tableW, hy, 0.35));

      const scale = tableW / block.columns.reduce((sum, col) => sum + col.width, 0);
      const scaled = block.columns.map((col) => ({ ...col, width: col.width * scale }));
      this.setInk(INK);
      let cx = tableX;
      for (const col of scaled) {
        this.page.ops.push(
          pdfAlignedText("F2", 6.8, cx, hy + 4, col.width, col.label, col.align ?? "left"),
        );
        cx += col.width;
      }
      y = hy;

      const paint = (row: Record<string, string>, bold = false, tint = false) => {
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
              7.2,
              colX,
              ry + 4,
              col.width,
              pdfClip(row[col.key] ?? "", Math.floor(col.width / 3.6)),
              col.align ?? "left",
            ),
          );
          colX += col.width;
        }
        y = ry;
      };

      for (const row of block.rows) paint(row);
      if (block.totalRow) paint(block.totalRow, true, true);
    };

    render(leftX, left);
    render(rightX, right);
    this.page.y = startY - sectionH - 12;
  }

  addReportNote(note: string) {
    const lines = wrapText(note, 92);
    const lineH = 10;
    const titleH = 14;
    const h = titleH + lines.length * lineH + 12;
    this.ensureSpace(h + 8);

    const y = this.page.y - h;
    this.page.ops.push(pdfFillRoundRect(MARGIN_X, y, CONTENT_W, h, SECTION_RADIUS, FILL_NOTE));
    this.setStroke(BORDER);
    this.page.ops.push(pdfStrokeRoundRect(MARGIN_X, y, CONTENT_W, h, SECTION_RADIUS, 0.55));

    this.setInk(INK);
    this.page.ops.push(pdfText("F2", 9, MARGIN_X + 10, y + h - 14, "Report Note"));
    this.setInk(MUTED);
    lines.forEach((line, index) => {
      this.page.ops.push(pdfText("F1", 7.5, MARGIN_X + 10, y + h - 14 - titleH - index * lineH, line));
    });
    this.page.y = y - 10;
  }

  private drawFooters() {
    const count = this.pages.length;
    this.pages.forEach((page, index) => {
      page.ops.push(`${BORDER} RG`);
      page.ops.push(pdfLine(MARGIN_X, 50, PAGE_W - MARGIN_X, 50, 0.5));

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
