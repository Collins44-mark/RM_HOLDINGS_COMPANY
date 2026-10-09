import type { SchoolExamDetail } from "@/actions/school/exams";
import {
  downloadPdfBytes,
  pdfAlignedText,
  pdfAscii,
  pdfClip,
  pdfLine,
  pdfTextWidth,
  type PdfFont,
} from "@/lib/pdf/report-document";
import { formatExamAverage, formatExamPosition, roundExamAverage } from "@/lib/school/exam-ranking";

export type ExamResultsPdfRow = {
  studentName: string;
  marks: Array<number | null>;
  average: number | null;
  position: number | null;
};

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN_X = 36;
const MARGIN_TOP = 28;
const MARGIN_BOTTOM = 28;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const INK = "0.059 0.090 0.165";
const MUTED = "0.392 0.455 0.545";
const STROKE = "0.820 0.843 0.878";
const FILL_HEADER = "0.941 0.949 0.961";
const FILL_AVG = "0.941 0.949 0.961";
const WHITE = "1 1 1";
const RADIUS = 5;
const ROW_H = 16;
const KAPPA = 0.5522847498;

type Column = {
  key: string;
  label: string;
  width: number;
  align: "left" | "right" | "center";
  headerLines: string[];
};

function pdfEscapeRaw(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function centerText(font: PdfFont, size: number, y: number, value: string, pageW = PAGE_W) {
  const width = pdfTextWidth(value.replace(/•/g, "-"), size, font === "F2");
  const x = Math.max(MARGIN_X, (pageW - width) / 2);
  const escaped = pdfEscapeRaw(pdfAscii(value.replace(/•/g, "\u0000"))).replace(/\u0000/g, "\\225");
  return `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escaped}) Tj ET`;
}

function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  corners: { tl: boolean; tr: boolean; br: boolean; bl: boolean },
) {
  const rr = Math.min(r, w / 2, h / 2);
  const k = rr * KAPPA;
  const x0 = x;
  const x1 = x + w;
  const y0 = y;
  const y1 = y + h;
  const parts: string[] = [];
  parts.push(`${(corners.bl ? x0 + rr : x0).toFixed(2)} ${y0.toFixed(2)} m`);
  parts.push(`${(corners.br ? x1 - rr : x1).toFixed(2)} ${y0.toFixed(2)} l`);
  if (corners.br) {
    parts.push(`${(x1 - rr + k).toFixed(2)} ${y0.toFixed(2)} ${x1.toFixed(2)} ${(y0 + rr - k).toFixed(2)} ${x1.toFixed(2)} ${(y0 + rr).toFixed(2)} c`);
  }
  parts.push(`${x1.toFixed(2)} ${(corners.tr ? y1 - rr : y1).toFixed(2)} l`);
  if (corners.tr) {
    parts.push(`${x1.toFixed(2)} ${(y1 - rr + k).toFixed(2)} ${(x1 - rr + k).toFixed(2)} ${y1.toFixed(2)} ${(x1 - rr).toFixed(2)} ${y1.toFixed(2)} c`);
  }
  parts.push(`${(corners.tl ? x0 + rr : x0).toFixed(2)} ${y1.toFixed(2)} l`);
  if (corners.tl) {
    parts.push(`${(x0 + rr - k).toFixed(2)} ${y1.toFixed(2)} ${x0.toFixed(2)} ${(y1 - rr + k).toFixed(2)} ${x0.toFixed(2)} ${(y1 - rr).toFixed(2)} c`);
  }
  parts.push(`${x0.toFixed(2)} ${(corners.bl ? y0 + rr : y0).toFixed(2)} l`);
  if (corners.bl) {
    parts.push(`${x0.toFixed(2)} ${(y0 + rr - k).toFixed(2)} ${(x0 + rr - k).toFixed(2)} ${y0.toFixed(2)} ${(x0 + rr).toFixed(2)} ${y0.toFixed(2)} c`);
  }
  parts.push("h");
  return parts.join(" ");
}

function wrapHeading(label: string, width: number, size: number) {
  const text = pdfAscii(label).trim() || "Subject";
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (pdfTextWidth(next, size, true) <= width - 6) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    const maxChars = Math.max(4, Math.floor((width - 6) / (size * 0.55)));
    current = pdfTextWidth(word, size, true) <= width - 6 ? word : pdfClip(word, maxChars);
  }
  if (current) lines.push(current);
  if (lines.length <= 2) return lines.slice(0, 2);
  return [lines[0], pdfClip(lines.slice(1).join(" "), Math.max(4, Math.floor((width - 6) / (size * 0.55))))];
}

function classAverages(rows: ExamResultsPdfRow[], subjectCount: number) {
  const subjects = Array.from({ length: subjectCount }, (_, index) => {
    const values = rows.map((row) => row.marks[index]).filter((mark): mark is number => mark != null);
    if (!values.length) return null;
    return roundExamAverage(values.reduce((sum, mark) => sum + mark, 0) / values.length);
  });
  const averages = rows.map((row) => row.average).filter((value): value is number => value != null);
  const overall = averages.length
    ? roundExamAverage(averages.reduce((sum, value) => sum + value, 0) / averages.length)
    : null;
  return { subjects, overall };
}

function academicLine(detail: SchoolExamDetail) {
  return [detail.exam.levelName, detail.exam.className, detail.exam.termName, detail.exam.yearName]
    .map((part) => pdfAscii(part ?? "").trim())
    .filter(Boolean)
    .join("  •  ");
}

function examTitle(detail: SchoolExamDetail) {
  return pdfAscii(detail.exam.name).trim() || "Results";
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

function clipToWidth(value: string, width: number, size: number, bold = false) {
  const text = pdfAscii(value);
  const factor = bold ? 0.55 : 0.5;
  const maxChars = Math.max(1, Math.floor((width - 8) / (size * factor)));
  return pdfClip(text, maxChars);
}

export function downloadExamResultsPdf(input: {
  detail: SchoolExamDetail;
  schoolName: string;
  rows: ExamResultsPdfRow[];
  sortLabel?: string;
}) {
  const { detail, rows } = input;
  const schoolName = pdfAscii(input.schoolName).trim() || "School Management";
  const subjectCount = detail.subjects.length;
  const noWidth = 28;
  const avgWidth = 38;
  const posWidth = 44;
  const studentWidth = Math.min(168, Math.max(108, CONTENT_W * 0.2 - Math.min(subjectCount, 10) * 2));
  const remaining = Math.max(80, CONTENT_W - noWidth - studentWidth - avgWidth - posWidth);
  const subjectWidth = subjectCount > 0 ? remaining / subjectCount : remaining;
  const headerSize = subjectWidth < 42 ? 6.5 : 7;

  const subjectColumns: Column[] = detail.subjects.map((subject, index) => {
    const label = pdfAscii(subject.name);
    return {
      key: `s${index}`,
      label,
      width: subjectWidth,
      align: "center",
      headerLines: wrapHeading(label, subjectWidth, headerSize),
    };
  });
  const headerLines = Math.max(1, ...subjectColumns.map((column) => column.headerLines.length), 1);
  const headerH = headerLines > 1 ? 26 : 20;

  const columns: Column[] = [
    { key: "no", label: "No.", width: noWidth, align: "center", headerLines: ["No."] },
    { key: "student", label: "Student", width: studentWidth, align: "left", headerLines: ["Student"] },
    ...subjectColumns,
    { key: "avg", label: "Avg.", width: avgWidth, align: "center", headerLines: ["Avg."] },
    { key: "position", label: "Position", width: posWidth, align: "center", headerLines: ["Position"] },
  ];

  const tableRows = rows.map((row, index) => {
    const next: Record<string, string> = {
      no: String(index + 1),
      student: clipToWidth(row.studentName, studentWidth, 8),
      avg: formatExamAverage(row.average),
      position: formatExamPosition(row.position),
    };
    row.marks.forEach((mark, markIndex) => {
      next[`s${markIndex}`] = mark == null ? "—" : String(mark);
    });
    return next;
  });

  const averages = classAverages(rows, subjectCount);
  const averageRow: Record<string, string> = {
    no: "",
    student: "Class Average",
    avg: formatExamAverage(averages.overall),
    position: "",
  };
  averages.subjects.forEach((value, index) => {
    averageRow[`s${index}`] = formatExamAverage(value);
  });

  const title = examTitle(detail);
  const details = academicLine(detail);
  const headerBlock = 52;
  const tableTop = PAGE_H - MARGIN_TOP - headerBlock;
  const minY = MARGIN_BOTTOM;
  const bodyRoom = tableTop - headerH - minY;
  const rowsPerPage = Math.max(2, Math.floor(bodyRoom / ROW_H));

  const pages: Array<{ start: number; end: number; showAverage: boolean }> = [];
  let cursor = 0;
  const total = tableRows.length;
  if (total === 0) {
    pages.push({ start: 0, end: 0, showAverage: true });
  }
  while (cursor < total) {
    const remainingRows = total - cursor;
    if (remainingRows <= rowsPerPage - 1) {
      pages.push({ start: cursor, end: total, showAverage: true });
      break;
    }
    if (remainingRows <= rowsPerPage) {
      pages.push({ start: cursor, end: total, showAverage: false });
      pages.push({ start: total, end: total, showAverage: true });
      break;
    }
    pages.push({ start: cursor, end: cursor + rowsPerPage, showAverage: false });
    cursor += rowsPerPage;
  }

  const pageStreams = pages.map((page) => {
    const ops: string[] = [];
    ops.push(`${WHITE} rg`);
    ops.push(`0 0 ${PAGE_W} ${PAGE_H} re f`);
    ops.push(`${INK} rg`);
    ops.push(centerText("F2", 13, PAGE_H - MARGIN_TOP - 2, schoolName));
    ops.push(centerText("F2", 10.5, PAGE_H - MARGIN_TOP - 18, title.toUpperCase()));
    ops.push(`${MUTED} rg`);
    ops.push(centerText("F1", 8.5, PAGE_H - MARGIN_TOP - 32, details));
    ops.push(`${STROKE} RG`);
    ops.push(pdfLine(MARGIN_X + 80, PAGE_H - MARGIN_TOP - 40, PAGE_W - MARGIN_X - 80, PAGE_H - MARGIN_TOP - 40, 0.6));

    const x = MARGIN_X;
    let y = tableTop;
    const tableBottom = y - headerH - (page.end - page.start) * ROW_H - (page.showAverage ? ROW_H : 0);
    const tableH = y - tableBottom;
    const frame = roundedRectPath(x, tableBottom, CONTENT_W, tableH, RADIUS, {
      tl: true,
      tr: true,
      br: true,
      bl: true,
    });
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
    for (const column of columns) {
      const lines = column.headerLines;
      const lineGap = 8;
      const block = lines.length * lineGap;
      const topPad = Math.max(2, (headerH - block) / 2);
      lines.forEach((line, lineIndex) => {
        const baseline = headerY + headerH - topPad - (lineIndex + 1) * lineGap + 2;
        ops.push(pdfAlignedText("F2", headerSize, cx, baseline, column.width, line, column.align));
      });
      cx += column.width;
    }
    y = headerY;

    const paintRow = (row: Record<string, string>, options: { bold?: boolean; fill?: boolean }) => {
      const ry = y - ROW_H;
      if (options.fill) {
        ops.push(`${FILL_AVG} rg`);
        ops.push(`${x.toFixed(2)} ${ry.toFixed(2)} ${CONTENT_W.toFixed(2)} ${ROW_H.toFixed(2)} re f`);
      }
      ops.push(`${STROKE} RG`);
      ops.push(pdfLine(x, ry, x + CONTENT_W, ry, 0.35));
      ops.push(`${INK} rg`);
      let colX = x;
      for (const column of columns) {
        ops.push(
          pdfAlignedText(
            options.bold ? "F2" : "F1",
            options.bold ? 8 : 8,
            colX,
            ry + 4.5,
            column.width,
            row[column.key] ?? "",
            column.align,
          ),
        );
        colX += column.width;
      }
      y = ry;
    };

    for (let index = page.start; index < page.end; index += 1) {
      paintRow(tableRows[index], {});
    }
    if (page.showAverage) paintRow(averageRow, { bold: true, fill: true });
    ops.push("Q");
    ops.push(`${STROKE} RG`);
    ops.push("0.45 w");
    ops.push(`${frame} S`);
    return ops.join("\n");
  });

  const safeName = pdfAscii(detail.exam.name).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "exam";
  downloadPdfBytes(buildLandscapePdf(pageStreams), `RM-School-Exam-Results-${safeName}.pdf`);
}
