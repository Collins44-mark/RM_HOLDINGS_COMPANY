import {
  formatPdfGeneratedAt,
  pdfAlignedText,
  pdfAscii,
  pdfClip,
  pdfLine,
  pdfText,
  pdfTextWidth,
  type PdfAlign,
} from "@/lib/pdf/report-document";
import type { SchoolReportWorkspace } from "@/lib/school/report-types";
import { SCHOOL_REPORT_DEFS } from "@/lib/school/report-types";

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN_X = 36;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 28;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const INK = "0.08 0.08 0.08";
const MUTED = "0.42 0.42 0.42";
const STROKE = "0.82 0.82 0.82";
const FILL_HEADER = "0.945 0.945 0.945";
const WHITE = "1 1 1";
const RADIUS = 4;
const KAPPA = 0.5522847498;
const BODY_SIZE = 7.4;
const HEADER_SIZE = 6.8;
const ROW_PAD = 4.5;

type Column = {
  key: string;
  label: string;
  width: number;
  align: PdfAlign;
};

type Spec = {
  key: string;
  label: string;
  min: number;
  weight: number;
  align?: PdfAlign;
};

function pdfRoundPath(x: number, y: number, w: number, h: number, r: number) {
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

function wrapLines(value: string, width: number, size: number, bold: boolean, maxLines: number) {
  const text = pdfAscii(String(value ?? "")).trim() || "—";
  const avail = Math.max(10, width - 8);
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  const fits = (chunk: string) => pdfTextWidth(chunk, size, bold) <= avail;
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
    kept[maxLines - 1] = pdfClip(kept[maxLines - 1], Math.max(3, Math.floor(avail / (size * (bold ? 0.55 : 0.5)))));
    return kept;
  }
  return lines;
}

function allocate(specs: Spec[], total: number): Column[] {
  const minSum = specs.reduce((sum, spec) => sum + spec.min, 0);
  if (minSum > total) {
    const scale = total / minSum;
    return specs.map((spec) => ({
      key: spec.key,
      label: spec.label,
      width: spec.min * scale,
      align: spec.align ?? "left",
    }));
  }
  const extra = total - minSum;
  const weightSum = specs.reduce((sum, spec) => sum + spec.weight, 0) || 1;
  return specs.map((spec) => ({
    key: spec.key,
    label: spec.label,
    width: spec.min + extra * (spec.weight / weightSum),
    align: spec.align ?? "left",
  }));
}

function cell(row: Record<string, string>, key: string) {
  const value = String(row[key] ?? "").trim();
  return value || "—";
}

function splitBus(value: string) {
  const raw = String(value ?? "").trim();
  const parts = raw.split(/\s*·\s*/).map((part) => pdfAscii(part).trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { registration: parts[0], name: parts.slice(1).join(" ") };
  }
  return { registration: pdfAscii(raw) || "—", name: "—" };
}

function placementLine(rows: Array<Record<string, string>>) {
  const levels = new Set(rows.map((row) => String(row.level ?? "").trim()).filter(Boolean));
  const classes = new Set(rows.map((row) => String(row.className ?? "").trim()).filter(Boolean));
  if (levels.size === 1 && classes.size === 1) return `${[...levels][0]}  |  ${[...classes][0]}`;
  if (levels.size === 1) return [...levels][0];
  return "";
}

function numbered(rows: Array<Record<string, string>>) {
  return rows.map((row, index) => ({ ...row, no: String(index + 1) }));
}

function columnsFor(workspace: SchoolReportWorkspace): { columns: Column[]; rows: Array<Record<string, string>> } {
  const kind = workspace.kind;
  const keys = new Set(workspace.columns.map((col) => col.key));
  const source = workspace.rows;

  if (kind === "admissions") {
    return {
      columns: allocate(
        [
          { key: "no", label: "No.", min: 24, weight: 0.4, align: "center" },
          { key: "admissionNumber", label: "Admission No.", min: 72, weight: 1.1 },
          { key: "student", label: "Student", min: 110, weight: 2.2 },
          { key: "date", label: "Admission Date", min: 68, weight: 1 },
          { key: "level", label: "Level", min: 58, weight: 1 },
          { key: "className", label: "Class", min: 58, weight: 1 },
          { key: "stream", label: "Stream", min: 40, weight: 0.7, align: "center" },
          { key: "year", label: "Academic Year", min: 62, weight: 1 },
          { key: "term", label: "Term", min: 44, weight: 0.8 },
          { key: "status", label: "Status", min: 58, weight: 0.9 },
        ],
        CONTENT_W,
      ),
      rows: numbered(source),
    };
  }

  if (kind === "students") {
    return {
      columns: allocate(
        [
          { key: "no", label: "No.", min: 24, weight: 0.4, align: "center" },
          { key: "name", label: "Student", min: 120, weight: 2.2 },
          { key: "studentNumber", label: "Student No.", min: 68, weight: 1.1 },
          { key: "admissionNumber", label: "Admission No.", min: 72, weight: 1.1 },
          { key: "level", label: "Level", min: 62, weight: 1 },
          { key: "className", label: "Class", min: 58, weight: 1 },
          { key: "stream", label: "Stream", min: 42, weight: 0.7, align: "center" },
          { key: "status", label: "Status", min: 52, weight: 0.8 },
        ],
        CONTENT_W,
      ),
      rows: numbered(source),
    };
  }

  if (kind === "parents") {
    return {
      columns: allocate(
        [
          { key: "no", label: "No.", min: 24, weight: 0.4, align: "center" },
          { key: "guardian", label: "Guardian", min: 100, weight: 1.8 },
          { key: "phone", label: "Phone", min: 72, weight: 1.1 },
          { key: "email", label: "Email", min: 110, weight: 1.8 },
          { key: "student", label: "Student", min: 100, weight: 1.8 },
          { key: "level", label: "Level", min: 58, weight: 1 },
          { key: "className", label: "Class", min: 52, weight: 0.9 },
          { key: "stream", label: "Stream", min: 40, weight: 0.7, align: "center" },
        ],
        CONTENT_W,
      ),
      rows: numbered(source),
    };
  }

  if (kind === "transport") {
    const split = source.some((row) => /\s*·\s*/.test(String(row.bus ?? "")));
    const mapped = numbered(source).map((row) => {
      const parts = splitBus(cell(row, "bus"));
      return { ...row, registration: parts.registration, busName: parts.name };
    });
    const specs: Spec[] = [
      { key: "no", label: "No.", min: 22, weight: 0.35, align: "center" },
      { key: "date", label: "Date", min: 58, weight: 0.9 },
    ];
    if (split) {
      specs.push({ key: "registration", label: "Registration", min: 62, weight: 1 });
      specs.push({ key: "busName", label: "Bus", min: 48, weight: 0.8 });
    } else {
      specs.push({ key: "bus", label: "Bus", min: 70, weight: 1.1 });
    }
    specs.push(
      { key: "type", label: "Type", min: 72, weight: 1 },
      { key: "description", label: "Service / Description", min: 110, weight: 2.1 },
      { key: "amount", label: "Amount", min: 72, weight: 1.1, align: "right" },
      { key: "reference", label: "Reference", min: 62, weight: 0.9 },
      { key: "status", label: "Status", min: 48, weight: 0.8 },
    );
    return { columns: allocate(specs, CONTENT_W), rows: mapped };
  }

  if (keys.has("employee")) {
    return {
      columns: allocate(
        [
          { key: "no", label: "No.", min: 24, weight: 0.4, align: "center" },
          { key: "employee", label: "Employee", min: 120, weight: 2 },
          { key: "staffNumber", label: "Staff no.", min: 62, weight: 1 },
          { key: "jobTitle", label: "Job title", min: 90, weight: 1.4 },
          { key: "commitment", label: "Monthly salary", min: 78, weight: 1.1, align: "right" },
          { key: "paid", label: "Paid", min: 70, weight: 1, align: "right" },
          { key: "outstanding", label: "Outstanding", min: 78, weight: 1.1, align: "right" },
        ],
        CONTENT_W,
      ),
      rows: numbered(source),
    };
  }

  if (keys.has("description") && keys.has("date") && !keys.has("student")) {
    return {
      columns: allocate(
        [
          { key: "no", label: "No.", min: 22, weight: 0.35, align: "center" },
          { key: "date", label: "Date", min: 58, weight: 0.9 },
          { key: "type", label: "Expense type", min: 78, weight: 1.2 },
          { key: "description", label: "Description", min: 120, weight: 2.2 },
          { key: "method", label: "Payment", min: 58, weight: 0.9 },
          { key: "amount", label: "Amount", min: 62, weight: 1, align: "right" },
          { key: "reference", label: "Reference", min: 58, weight: 0.9 },
          { key: "bus", label: "Bus", min: 52, weight: 0.8 },
          { key: "status", label: "Status", min: 52, weight: 0.8 },
        ],
        CONTENT_W,
      ),
      rows: numbered(source),
    };
  }

  return {
    columns: allocate(
      [
        { key: "no", label: "No.", min: 22, weight: 0.35, align: "center" },
        { key: "student", label: "Student", min: 100, weight: 2 },
        { key: "studentNumber", label: "Student No.", min: 62, weight: 1 },
        { key: "level", label: "Level", min: 54, weight: 0.9 },
        { key: "className", label: "Class", min: 48, weight: 0.8 },
        { key: "year", label: "Academic Year", min: 62, weight: 1 },
        { key: "billed", label: "Billed", min: 62, weight: 1, align: "right" },
        { key: "paid", label: "Paid", min: 62, weight: 1, align: "right" },
        { key: "outstanding", label: "Outstanding", min: 70, weight: 1.1, align: "right" },
        { key: "status", label: "Status", min: 58, weight: 0.9 },
      ],
      CONTENT_W,
    ),
    rows: numbered(source),
  };
}

function metricRows(cards: SchoolReportWorkspace["cards"]) {
  if (!cards.length) return [] as SchoolReportWorkspace["cards"][];
  if (cards.length <= 3) return [cards];
  if (cards.length === 4) return [cards.slice(0, 2), cards.slice(2)];
  return [cards.slice(0, 2), cards.slice(2)];
}

function rowHeight(lines: number) {
  return Math.max(16, 8 + lines * 9);
}

function buildLandscapePdf(pageStreams: string[]) {
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
  chunks.push(xrefTable, `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
  return new TextEncoder().encode(chunks.join(""));
}

export function buildSchoolReportPdf(workspace: SchoolReportWorkspace) {
  const def = SCHOOL_REPORT_DEFS.find((item) => item.id === workspace.kind);
  const schoolName = pdfAscii(workspace.schoolName).trim().toUpperCase() || "SCHOOL MANAGEMENT";
  const title = def?.label ?? "School Report";
  const subtitle = def?.description ?? "";
  const periodDates = workspace.from && workspace.to ? `${workspace.from} to ${workspace.to}` : workspace.periodLabel;
  const generated = `Generated on: ${formatPdfGeneratedAt()}`;
  const context = placementLine(workspace.rows);
  const layout = columnsFor(workspace);
  const headerLines = layout.columns.map((col) => wrapLines(col.label, col.width, HEADER_SIZE, true, 2));
  const headerH = Math.max(18, ...headerLines.map((lines) => 6 + lines.length * 8));
  const tableRows = layout.rows.map((row) => {
    const lines = Object.fromEntries(
      layout.columns.map((col) => [col.key, wrapLines(cell(row, col.key), col.width, BODY_SIZE, false, 2)]),
    ) as Record<string, string[]>;
    const height = rowHeight(Math.max(1, ...Object.values(lines).map((item) => item.length)));
    return { lines, height };
  });

  const metricGrid = metricRows(workspace.cards);
  const metricStride = 42;
  const titleBlock = 80;
  const continuedBlock = 64;
  const tableTopFirst = PAGE_H - MARGIN_TOP - titleBlock - metricGrid.length * metricStride;
  const minY = MARGIN_BOTTOM + 14;

  type Page = { start: number; end: number; first: boolean };
  const pages: Page[] = [];
  let cursor = 0;
  if (!tableRows.length) {
    pages.push({ start: 0, end: 0, first: true });
  }
  while (cursor < tableRows.length) {
    const first = pages.length === 0;
    const top = first ? tableTopFirst : PAGE_H - MARGIN_TOP - continuedBlock;
    let used = headerH;
    let end = cursor;
    while (end < tableRows.length) {
      const next = tableRows[end].height;
      if (top - used - next < minY) break;
      used += next;
      end += 1;
    }
    if (end === cursor) {
      end = cursor + 1;
    }
    pages.push({ start: cursor, end, first });
    cursor = end;
  }

  const pageStreams = pages.map((page, pageIndex) => {
    const ops: string[] = [];
    ops.push(`${WHITE} rg`);
    ops.push(`0 0 ${PAGE_W} ${PAGE_H} re f`);

    const yTop = PAGE_H - MARGIN_TOP;
    ops.push(`${INK} rg`);
    ops.push(pdfText("F2", 12.5, MARGIN_X, yTop - 2, schoolName));
    if (context) {
      ops.push(`${MUTED} rg`);
      ops.push(pdfText("F1", 8, MARGIN_X, yTop - 16, context));
    }

    ops.push(`${MUTED} rg`);
    const periodLabel = "Report Period";
    ops.push(pdfText("F1", 8, PAGE_W - MARGIN_X - pdfTextWidth(periodLabel, 8), yTop - 2, periodLabel));
    ops.push(`${INK} rg`);
    ops.push(pdfText("F2", 8.5, PAGE_W - MARGIN_X - pdfTextWidth(periodDates, 8.5, true), yTop - 14, periodDates));
    ops.push(`${MUTED} rg`);
    ops.push(pdfText("F1", 7.5, PAGE_W - MARGIN_X - pdfTextWidth(generated, 7.5), yTop - 26, generated));

    ops.push(`${STROKE} RG`);
    ops.push(pdfLine(MARGIN_X, yTop - 34, PAGE_W - MARGIN_X, yTop - 34, 0.45));

    let y = yTop - 50;
    if (page.first) {
      ops.push(`${INK} rg`);
      ops.push(pdfText("F2", 16, MARGIN_X, y, title));
      y -= 14;
      ops.push(`${MUTED} rg`);
      ops.push(pdfText("F1", 8, MARGIN_X, y, subtitle));
      y -= 16;

      for (const row of metricGrid) {
        const gap = 8;
        const boxW = (CONTENT_W - gap * (row.length - 1)) / row.length;
        const boxH = 34;
        const boxY = y - boxH;
        row.forEach((card, index) => {
          const bx = MARGIN_X + index * (boxW + gap);
          const path = pdfRoundPath(bx, boxY, boxW, boxH, 3);
          ops.push(`${STROKE} RG`);
          ops.push("0.55 w");
          ops.push(`${path} S`);
          ops.push(`${MUTED} rg`);
          ops.push(pdfText("F1", 7.2, bx + 8, boxY + boxH - 12, pdfAscii(card.label)));
          ops.push(`${INK} rg`);
          const value = wrapLines(card.value, boxW - 6, 11, true, 1)[0];
          ops.push(pdfText("F2", 11, bx + 8, boxY + 8, value));
        });
        y -= metricStride;
      }
    } else {
      ops.push(`${INK} rg`);
      ops.push(pdfText("F2", 10, MARGIN_X, y, `${title} (continued)`));
      y -= 14;
    }

    const slice = tableRows.slice(page.start, page.end);
    const bodyH = slice.reduce((sum, row) => sum + row.height, 0);
    const tableH = headerH + Math.max(bodyH, page.end === page.start ? 22 : 0);
    const tableBottom = y - tableH;
    const x = MARGIN_X;
    const frame = pdfRoundPath(x, tableBottom, CONTENT_W, tableH, RADIUS);

    ops.push("q");
    ops.push(`${frame} W n`);
    ops.push(`${WHITE} rg`);
    ops.push(`${x.toFixed(2)} ${tableBottom.toFixed(2)} ${CONTENT_W.toFixed(2)} ${tableH.toFixed(2)} re f`);

    const headerY = y - headerH;
    ops.push(`${FILL_HEADER} rg`);
    ops.push(`${x.toFixed(2)} ${headerY.toFixed(2)} ${CONTENT_W.toFixed(2)} ${headerH.toFixed(2)} re f`);
    ops.push(`${STROKE} RG`);
    ops.push(pdfLine(x, headerY, x + CONTENT_W, headerY, 0.4));
    ops.push(`${INK} rg`);
    let cx = x;
    layout.columns.forEach((col, colIndex) => {
      const lines = headerLines[colIndex];
      lines.forEach((line, lineIndex) => {
        const baseline = headerY + headerH - 6 - (lineIndex + 1) * 8 + 3;
        ops.push(pdfAlignedText("F2", HEADER_SIZE, cx, baseline, col.width, line, col.align));
      });
      cx += col.width;
    });

    let ry = headerY;
    if (!slice.length) {
      const emptyY = ry - 22;
      ops.push(`${STROKE} RG`);
      ops.push(pdfLine(x, emptyY, x + CONTENT_W, emptyY, 0.35));
      ops.push(`${MUTED} rg`);
      ops.push(pdfText("F1", 8, x + 8, emptyY + 8, "No matching records for the selected filters."));
      ry = emptyY;
    } else {
      for (const row of slice) {
        const nextY = ry - row.height;
        ops.push(`${STROKE} RG`);
        ops.push(pdfLine(x, nextY, x + CONTENT_W, nextY, 0.32));
        ops.push(`${INK} rg`);
        let colX = x;
        for (const col of layout.columns) {
          const lines = row.lines[col.key] ?? ["—"];
          lines.forEach((line, lineIndex) => {
            const baseline = nextY + row.height - ROW_PAD - (lineIndex + 1) * 9 + 3;
            ops.push(pdfAlignedText("F1", BODY_SIZE, colX, baseline, col.width, line, col.align));
          });
          colX += col.width;
        }
        ry = nextY;
      }
    }

    let dividerX = x;
    const dividerBottom = slice.length ? tableBottom : headerY;
    for (let index = 0; index < layout.columns.length - 1; index += 1) {
      dividerX += layout.columns[index].width;
      ops.push(`${STROKE} RG`);
      ops.push(pdfLine(dividerX, dividerBottom, dividerX, y, 0.32));
    }
    ops.push("Q");
    ops.push(`${STROKE} RG`);
    ops.push("0.45 w");
    ops.push(`${frame} S`);

    ops.push(`${STROKE} RG`);
    ops.push(pdfLine(MARGIN_X, 18, PAGE_W - MARGIN_X, 18, 0.4));
    ops.push(`${MUTED} rg`);
    ops.push(pdfText("F1", 7.5, MARGIN_X, 8, schoolName));
    const pageLabel = `Page ${pageIndex + 1} of ${pages.length}`;
    ops.push(pdfText("F1", 7.5, PAGE_W - MARGIN_X - pdfTextWidth(pageLabel, 7.5), 8, pageLabel));
    return ops.join("\n");
  });

  return buildLandscapePdf(pageStreams);
}
