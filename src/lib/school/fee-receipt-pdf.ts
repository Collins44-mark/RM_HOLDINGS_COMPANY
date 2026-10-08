import { APP_NAME } from "@/lib/config/app";
import { formatTzs } from "@/lib/format/currency";

export type FeeReceiptPayload = {
  schoolName: string;
  studentName: string;
  studentNumber: string;
  admissionNumber: string;
  academicYearName: string;
  levelName: string;
  className: string;
  streamName: string;
  feeContext: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  methodLabel: string;
  reference: string;
  recordedByName: string;
  verifiedByName: string;
  outstandingAmount: number | null;
};

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function ascii(value: string) {
  return value.replace(/[^\x20-\x7E]/g, (char) => {
    if (char === "–" || char === "—") return "-";
    return " ";
  });
}

function text(font: "F1" | "F2", size: number, x: number, y: number, value: string) {
  return `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(ascii(value))}) Tj ET`;
}

function line(x1: number, y1: number, x2: number, y2: number, width = 0.6) {
  return `${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`;
}

function fillRect(x: number, y: number, w: number, h: number, color: string) {
  return `${color} ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`;
}

function row(label: string, value: string, y: number) {
  return [text("F1", 10, MARGIN, y, label), text("F2", 10, 220, y, value)].join("\n");
}

function buildPdf(stream: string) {
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [5 0 R] /Count 1 >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 6 0 R >>`,
  );
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);

  let offset = 0;
  const chunks: string[] = ["%PDF-1.4\n"];
  offset = chunks[0].length;
  const xref: number[] = [0];
  objects.forEach((object, index) => {
    xref.push(offset);
    const body = `${index + 1} 0 obj\n${object}\nendobj\n`;
    chunks.push(body);
    offset += body.length;
  });
  const xrefStart = offset;
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  xref.slice(1).forEach((value) => {
    chunks.push(`${String(value).padStart(10, "0")} 00000 n \n`);
  });
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
  return chunks.join("");
}

export function buildFeeReceiptPdf(payload: FeeReceiptPayload) {
  const y = (n: number) => PAGE_H - n;
  const stream = [
    fillRect(0, PAGE_H - 84, PAGE_W, 84, "0.043 0.133 0.267"),
    "1 1 1 rg",
    text("F2", 11, MARGIN, y(32), APP_NAME.toUpperCase()),
    text("F1", 10, MARGIN, y(48), payload.schoolName || "School Management"),
    text("F2", 18, MARGIN, y(70), "Fee Payment Receipt"),
    "0.043 0.133 0.267 rg",
    line(MARGIN, y(96), PAGE_W - MARGIN, y(96), 0.8),
    row("Student", payload.studentName || "-", y(120)),
    row("Student No.", payload.studentNumber || "-", y(138)),
    row("Admission No.", payload.admissionNumber || "-", y(156)),
    row("Academic Year", payload.academicYearName || "-", y(174)),
    row("Level", payload.levelName || "-", y(192)),
    row("Class", payload.className || "-", y(210)),
    row("Stream", payload.streamName || "-", y(228)),
    row("Fee", payload.feeContext || "-", y(246)),
    line(MARGIN, y(262), PAGE_W - MARGIN, y(262), 0.5),
    row("Payment No.", payload.paymentNumber || "-", y(286)),
    row("Payment date", payload.paymentDate || "-", y(304)),
    row("Amount", formatTzs(payload.amount), y(322)),
    row("Method", payload.methodLabel || "-", y(340)),
    row("Reference", payload.reference || "-", y(358)),
    row("Recorded by", payload.recordedByName || "-", y(376)),
    row("Verified by", payload.verifiedByName || "-", y(394)),
    row(
      "Outstanding",
      payload.outstandingAmount == null ? "Not configured" : formatTzs(payload.outstandingAmount),
      y(412),
    ),
  ].join("\n");
  return buildPdf(stream);
}

export function downloadFeeReceiptPdf(payload: FeeReceiptPayload) {
  const pdf = buildFeeReceiptPdf(payload);
  const bytes = Uint8Array.from(pdf, (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${payload.paymentNumber || "fee-receipt"}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
