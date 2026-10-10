import { APP_NAME } from "@/lib/config/app";
import { formatTzs } from "@/lib/format/currency";
import { downloadPdfBytes, formatPdfGeneratedAt } from "@/lib/pdf/report-document";
import { FormalReportDocument } from "@/lib/pdf/formal-layout";

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

export function buildFeeReceiptPdf(payload: FeeReceiptPayload) {
  const schoolName = payload.schoolName || "School Management";
  const doc = new FormalReportDocument({
    brandName: APP_NAME,
    businessUnit: schoolName,
    title: "Fee Payment Receipt",
    subtitle: payload.feeContext || "School fee payment",
    periodLabel: payload.paymentNumber || "Receipt",
    periodDates: payload.paymentDate || "",
    generatedAt: formatPdfGeneratedAt(),
    footerLeft: schoolName,
  });
  doc.addSectionTable(
    "Student",
    [
      { key: "label", label: "Field", width: 180 },
      { key: "value", label: "Value", width: 331 },
    ],
    [
      { label: "Student", value: payload.studentName || "—" },
      { label: "Student No.", value: payload.studentNumber || "—" },
      { label: "Admission No.", value: payload.admissionNumber || "—" },
      { label: "Academic Year", value: payload.academicYearName || "—" },
      { label: "Level", value: payload.levelName || "—" },
      { label: "Class", value: payload.className || "—" },
      { label: "Stream", value: payload.streamName || "—" },
    ],
  );
  doc.addSectionTable(
    "Payment",
    [
      { key: "label", label: "Field", width: 180 },
      { key: "value", label: "Value", width: 331 },
    ],
    [
      { label: "Payment No.", value: payload.paymentNumber || "—" },
      { label: "Payment date", value: payload.paymentDate || "—" },
      { label: "Amount", value: formatTzs(payload.amount) },
      { label: "Method", value: payload.methodLabel || "—" },
      { label: "Reference", value: payload.reference || "—" },
      { label: "Recorded by", value: payload.recordedByName || "—" },
      { label: "Verified by", value: payload.verifiedByName || "—" },
      {
        label: "Outstanding",
        value: payload.outstandingAmount == null ? "Not configured" : formatTzs(payload.outstandingAmount),
      },
    ],
  );
  return doc.build();
}

export function downloadFeeReceiptPdf(payload: FeeReceiptPayload) {
  downloadPdfBytes(buildFeeReceiptPdf(payload), `${payload.paymentNumber || "fee-receipt"}.pdf`);
}
