import { formatAmount } from "@/lib/format/currency";
import {
  PAGE_H,
  PAGE_W,
  downloadPdfBytes,
  pdfAscii,
  pdfLine,
  pdfText,
  pdfTextWidth,
} from "@/lib/pdf/report-document";
import { wrapPdfLines } from "@/lib/pdf/formal-layout";
import {
  buildReceiptBreakdown,
  formatReceiptDateTime,
  formatSchoolReceiptNumber,
  receiptAddressLine,
  receiptClassLabel,
  receiptContactLine,
  receiptStatusLabel,
  tanzanianShillingsInWords,
  type SchoolReceiptLine,
} from "@/lib/school/fee-receipt";
import { formatCompactStudentNumber } from "@/lib/school/student-number";

export type FeeReceiptPayload = {
  schoolName: string;
  schoolAddress: string;
  schoolCity: string;
  schoolPhone: string;
  schoolEmail: string;
  logoUrl: string;
  logoJpegBase64: string;
  studentName: string;
  studentNumber: string;
  admissionNumber: string;
  academicYearName: string;
  levelName: string;
  className: string;
  streamName: string;
  paymentCategory: string;
  feeContext: string;
  paymentNumber: string;
  paymentDate: string;
  recordedAt: string;
  amount: number;
  methodLabel: string;
  reference: string;
  recordedByName: string;
  verifiedByName: string;
  status: string;
  billedAmount: number | null;
  previouslyPaid: number;
  outstandingAmount: number | null;
  signatoryName: string;
};

const NAVY = "0.043 0.133 0.267";
const MUTED = "0.451 0.525 0.604";
const PANEL = "0.953 0.969 0.984";
const HEAD = "0.910 0.949 0.980";
const EMPH = "0.890 0.937 0.976";
const LINE = "0.820 0.875 0.925";
const PAID_BG = "0.906 0.965 0.914";
const PAID_FG = "0.133 0.490 0.290";
const WHITE = "1 1 1";
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

function fill(x: number, y: number, w: number, h: number, color: string) {
  return `${color} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`;
}

function stroke(x: number, y: number, w: number, h: number, color = LINE, width = 0.6) {
  return `${color} RG ${width} w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`;
}

function roundRect(x: number, y: number, w: number, h: number, r: number, fillColor: string) {
  const rr = Math.min(r, w / 2, h / 2);
  const k = 0.5522847498 * rr;
  return [
    `${fillColor} rg`,
    `${(x + rr).toFixed(2)} ${y.toFixed(2)} m`,
    `${(x + w - rr).toFixed(2)} ${y.toFixed(2)} l`,
    `${(x + w - rr + k).toFixed(2)} ${y.toFixed(2)} ${(x + w).toFixed(2)} ${(y + rr - k).toFixed(2)} ${(x + w).toFixed(2)} ${(y + rr).toFixed(2)} c`,
    `${(x + w).toFixed(2)} ${(y + h - rr).toFixed(2)} l`,
    `${(x + w).toFixed(2)} ${(y + h - rr + k).toFixed(2)} ${(x + w - rr + k).toFixed(2)} ${(y + h).toFixed(2)} ${(x + w - rr).toFixed(2)} ${(y + h).toFixed(2)} c`,
    `${(x + rr).toFixed(2)} ${(y + h).toFixed(2)} l`,
    `${(x + rr - k).toFixed(2)} ${(y + h).toFixed(2)} ${x.toFixed(2)} ${(y + h - rr + k).toFixed(2)} ${x.toFixed(2)} ${(y + h - rr).toFixed(2)} c`,
    `${x.toFixed(2)} ${(y + rr).toFixed(2)} l`,
    `${x.toFixed(2)} ${(y + rr - k).toFixed(2)} ${(x + rr - k).toFixed(2)} ${y.toFixed(2)} ${(x + rr).toFixed(2)} ${y.toFixed(2)} c`,
    "h f",
  ].join(" ");
}

function base64ToBytes(value: string) {
  const raw = value.replace(/^data:image\/jpeg[^,]*,/i, "");
  if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(raw, "base64"));
  const binary = globalThis.atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJpeg(base64: string) {
  const raw = String(base64 ?? "").trim();
  if (!raw) return null;
  const bytes = base64ToBytes(raw);
  if (bytes.length < 8 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      if (width > 0 && height > 0) return { bytes, width, height };
    }
    i += 2 + len;
  }
  return null;
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function ascii(value: string) {
  return new TextEncoder().encode(value);
}

function buildPdf(content: string, image: { bytes: Uint8Array; width: number; height: number } | null) {
  const objects: Uint8Array[] = [];
  objects.push(ascii("<< /Type /Catalog /Pages 2 0 R >>"));
  objects.push(ascii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  const resources = image
    ? "<< /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 6 0 R >> >>"
    : "<< /Font << /F1 4 0 R /F2 5 0 R >> >>";
  objects.push(ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources ${resources} /Contents 7 0 R >>`));
  objects.push(ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  objects.push(ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
  if (image) {
    objects.push(
      concat([
        ascii(
          `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
        ),
        image.bytes,
        ascii("\nendstream"),
      ]),
    );
  } else {
    objects.push(ascii("<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] /Length 0 >>\nstream\nendstream"));
  }
  objects.push(ascii(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));

  const encoder = ascii("%PDF-1.4\n");
  const chunks: Uint8Array[] = [encoder];
  let offset = encoder.length;
  const xref = [0];
  objects.forEach((body, index) => {
    xref.push(offset);
    const header = ascii(`${index + 1} 0 obj\n`);
    const footer = ascii("\nendobj\n");
    const object = concat([header, body, footer]);
    chunks.push(object);
    offset += object.length;
  });
  let xrefTable = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  xref.slice(1).forEach((value) => {
    xrefTable += `${String(value).padStart(10, "0")} 00000 n \n`;
  });
  chunks.push(
    ascii(
      `${xrefTable}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`,
    ),
  );
  return concat(chunks);
}

function detailColumn(
  ops: string[],
  x: number,
  y: number,
  width: number,
  rows: Array<{ label: string; value: string }>,
) {
  let cursor = y;
  for (const row of rows) {
    if (!row.value) continue;
    ops.push(`${MUTED} rg`);
    ops.push(pdfText("F1", 8, x, cursor, row.label));
    const lines = wrapPdfLines(row.value, width - 108, 9.2, true, 2);
    ops.push(`${NAVY} rg`);
    lines.forEach((line, index) => {
      ops.push(pdfText("F2", 9.2, x + 108, cursor - index * 11, line));
    });
    cursor -= Math.max(16, lines.length * 11 + 5);
  }
  return cursor;
}

export function receiptLines(payload: FeeReceiptPayload): SchoolReceiptLine[] {
  return buildReceiptBreakdown({
    chargeDescription: payload.feeContext,
    billed: payload.billedAmount,
    previouslyPaid: payload.previouslyPaid,
    thisPayment: payload.amount,
    outstanding: payload.outstandingAmount,
  });
}

export function buildFeeReceiptPdf(payload: FeeReceiptPayload) {
  const schoolName = payload.schoolName || "School Management";
  const receiptNo = formatSchoolReceiptNumber(payload.paymentNumber);
  const when = formatReceiptDateTime(payload.recordedAt, payload.paymentDate);
  const status = receiptStatusLabel(payload.status);
  const address = receiptAddressLine(payload.schoolAddress, payload.schoolCity);
  const contact = receiptContactLine(payload.schoolPhone, payload.schoolEmail);
  const classLabel = receiptClassLabel(payload.levelName, payload.className, payload.streamName);
  const studentId = formatCompactStudentNumber(payload.studentNumber);
  const lines = receiptLines(payload);
  const words = tanzanianShillingsInWords(payload.amount);
  const image = decodeJpeg(payload.logoJpegBase64);
  const ops: string[] = [];
  ops.push(`${WHITE} rg 0 0 ${PAGE_W} ${PAGE_H} re f`);

  let y = PAGE_H - 52;
  const logoSize = 52;
  if (image) {
    const scale = Math.min(logoSize / image.width, logoSize / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${MARGIN.toFixed(2)} ${(y - h + 8).toFixed(2)} cm /Im1 Do Q`);
  }
  const textX = image ? MARGIN + logoSize + 14 : MARGIN;
  ops.push(`${NAVY} rg`);
  const nameLines = wrapPdfLines(schoolName.toUpperCase(), CONTENT_W - (image ? logoSize + 18 : 0), 13.5, true, 2);
  nameLines.forEach((line, index) => {
    ops.push(pdfText("F2", 13.5, textX, y - index * 15, line));
  });
  let infoY = y - nameLines.length * 15 - 4;
  if (address) {
    ops.push(`${MUTED} rg`);
    wrapPdfLines(address, CONTENT_W - (image ? logoSize + 18 : 0), 8.5, false, 2).forEach((line, index) => {
      ops.push(pdfText("F1", 8.5, textX, infoY - index * 11, line));
    });
    infoY -= 12;
  }
  if (contact) {
    ops.push(`${MUTED} rg`);
    ops.push(pdfText("F1", 8.5, textX, infoY - 8, contact));
    infoY -= 12;
  }
  y = Math.min(y - logoSize + 8, infoY) - 16;
  ops.push(`${NAVY} RG`);
  ops.push(pdfLine(MARGIN, y, PAGE_W - MARGIN, y, 1.1));
  y -= 28;

  ops.push(`${NAVY} rg`);
  ops.push(pdfText("F2", 18, MARGIN, y, "PAYMENT RECEIPT"));
  ops.push(`${MUTED} rg`);
  ops.push(pdfText("F1", 8.5, MARGIN, y - 14, "This is an official receipt for school payments."));
  const badgeW = Math.max(52, pdfTextWidth(status, 8, true) + 16);
  const badgeX = PAGE_W - MARGIN - 168;
  ops.push(roundRect(badgeX, y - 6, badgeW, 16, 8, PAID_BG));
  ops.push(`${PAID_FG} rg`);
  ops.push(pdfText("F2", 8, badgeX + 8, y - 1.5, status));
  ops.push(`${MUTED} rg`);
  ops.push(pdfText("F1", 8, PAGE_W - MARGIN - 108, y + 8, "Receipt No."));
  ops.push(`${NAVY} rg`);
  ops.push(pdfText("F2", 9.5, PAGE_W - MARGIN - 108, y - 4, receiptNo));
  ops.push(`${MUTED} rg`);
  ops.push(pdfText("F1", 8, PAGE_W - MARGIN - 108, y - 20, "Date & Time"));
  ops.push(`${NAVY} rg`);
  ops.push(pdfText("F2", 9, PAGE_W - MARGIN - 108, y - 32, when || "—"));
  y -= 52;

  const panelH = 108;
  ops.push(roundRect(MARGIN, y - panelH, CONTENT_W, panelH, 8, PANEL));
  const colW = (CONTENT_W - 28) / 2;
  const leftRows = [
    { label: "Student Name", value: payload.studentName },
    { label: "Student ID", value: studentId },
    { label: "Class", value: classLabel },
    { label: "Academic Year", value: payload.academicYearName },
  ];
  const rightRows = [
    { label: "Payment Category", value: payload.paymentCategory },
    { label: "Description", value: payload.feeContext },
    { label: "Payment Method", value: payload.methodLabel },
    { label: "Reference", value: payload.reference || "—" },
    { label: "Received By", value: payload.recordedByName || "—" },
  ];
  detailColumn(ops, MARGIN + 14, y - 16, colW, leftRows);
  detailColumn(ops, MARGIN + 18 + colW, y - 16, colW, rightRows);
  y -= panelH + 18;

  const tableX = MARGIN;
  const tableW = CONTENT_W;
  const rowH = 20;
  const headerH = 22;
  ops.push(fill(tableX, y - headerH, tableW, headerH, HEAD));
  ops.push(`${NAVY} rg`);
  ops.push(pdfText("F2", 8, tableX + 10, y - 14, "DESCRIPTION"));
  const amountHeader = "AMOUNT (TZS)";
  ops.push(pdfText("F2", 8, tableX + tableW - pdfTextWidth(amountHeader, 8, true) - 10, y - 14, amountHeader));
  const tableTop = y;
  y -= headerH;
  lines.forEach((line) => {
    const bg = line.emphasize ? EMPH : WHITE;
    ops.push(fill(tableX, y - rowH, tableW, rowH, bg));
    ops.push(`${LINE} RG`);
    ops.push(pdfLine(tableX, y, tableX + tableW, y, 0.45));
    ops.push(`${NAVY} rg`);
    const labelFont = line.emphasize ? "F2" : "F1";
    ops.push(pdfText(labelFont, 9, tableX + 10, y - 13, pdfAscii(line.label)));
    const amount = formatAmount(line.amount);
    ops.push(pdfText(labelFont, 9, tableX + tableW - pdfTextWidth(amount, 9, line.emphasize) - 10, y - 13, amount));
    y -= rowH;
  });
  ops.push(stroke(tableX, y, tableW, tableTop - y, LINE, 0.55));
  y -= 16;

  ops.push(roundRect(MARGIN, y - 28, CONTENT_W, 28, 8, PANEL));
  ops.push(`${MUTED} rg`);
  ops.push(pdfText("F1", 8.5, MARGIN + 12, y - 17, "Amount in Words:"));
  ops.push(`${NAVY} rg`);
  const wordLines = wrapPdfLines(words, CONTENT_W - 130, 9.2, true, 2);
  wordLines.forEach((line, index) => {
    ops.push(pdfText("F2", 9.2, MARGIN + 118, y - 17 - index * 11, line));
  });
  y -= 56;

  ops.push(`${MUTED} rg`);
  ops.push(pdfText("F1", 9, MARGIN, y, "Thank you for your payment."));
  ops.push(`${NAVY} rg`);
  ops.push(pdfText("F2", 10, MARGIN, y - 16, schoolName.toUpperCase()));
  const signX = PAGE_W - MARGIN - 180;
  ops.push(`${LINE} RG`);
  ops.push(pdfLine(signX, y - 8, PAGE_W - MARGIN, y - 8, 0.7));
  ops.push(`${MUTED} rg`);
  ops.push(pdfText("F1", 8, signX + 36, y - 22, "Authorized Signature"));
  if (payload.signatoryName) {
    ops.push(pdfText("F1", 8, signX + 36, y + 2, payload.signatoryName));
  }

  return buildPdf(ops.join("\n"), image);
}

async function jpegFromClient(url: string) {
  const next = String(url ?? "").trim();
  if (!next || typeof document === "undefined") return "";
  if (/^data:image\/jpeg/i.test(next)) return next.replace(/^data:image\/jpeg[^,]*,/i, "");
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      node.crossOrigin = "anonymous";
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error("logo"));
      node.src = next;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(image, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.86).replace(/^data:image\/jpeg[^,]*,/i, "");
  } catch {
    return "";
  }
}

export async function downloadFeeReceiptPdf(payload: FeeReceiptPayload) {
  const logoJpegBase64 = payload.logoJpegBase64 || (await jpegFromClient(payload.logoUrl));
  const number = formatSchoolReceiptNumber(payload.paymentNumber);
  downloadPdfBytes(buildFeeReceiptPdf({ ...payload, logoJpegBase64 }), `${number}.pdf`);
}
