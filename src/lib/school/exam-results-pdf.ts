import { APP_NAME } from "@/lib/config/app";
import {
  CONTENT_W,
  downloadPdfBytes,
  formatPdfGeneratedAt,
  pdfAscii,
  ReportDocument,
  type TableColumn,
} from "@/lib/pdf/report-document";
import { formatExamAverage, formatExamPosition } from "@/lib/school/exam-ranking";
import type { SchoolExamDetail } from "@/actions/school/exams";

export type ExamResultsPdfRow = {
  studentName: string;
  marks: Array<number | null>;
  average: number | null;
  position: number | null;
};

export function downloadExamResultsPdf(input: {
  detail: SchoolExamDetail;
  schoolName: string;
  rows: ExamResultsPdfRow[];
  sortLabel: string;
}) {
  const { detail, schoolName, rows } = input;
  const subjectCount = detail.subjects.length;
  const studentWidth = Math.max(110, 170 - Math.min(subjectCount, 8) * 6);
  const avgWidth = 42;
  const posWidth = 48;
  const remaining = Math.max(80, CONTENT_W - studentWidth - avgWidth - posWidth);
  const subjectWidth = subjectCount > 0 ? remaining / subjectCount : remaining;

  const columns: TableColumn[] = [
    { key: "student", label: "Student", width: studentWidth },
    ...detail.subjects.map((subject, index) => ({
      key: `s${index}`,
      label: pdfAscii(subject.name),
      width: subjectWidth,
      align: "right" as const,
    })),
    { key: "avg", label: "Avg", width: avgWidth, align: "right" as const },
    { key: "position", label: "Position", width: posWidth, align: "right" as const },
  ];

  const tableRows = rows.map((row) => {
    const next: Record<string, string> = {
      student: pdfAscii(row.studentName),
      avg: formatExamAverage(row.average),
      position: formatExamPosition(row.position),
    };
    row.marks.forEach((mark, index) => {
      next[`s${index}`] = mark == null ? "-" : String(mark);
    });
    return next;
  });

  const periodParts = [detail.exam.yearName, detail.exam.termName].filter(Boolean);
  const statusNote =
    detail.exam.status !== "published"
      ? "These results have not been published."
      : rows.some((row) => row.position == null)
        ? "Incomplete subject marks are shown as Pending and are not ranked."
        : undefined;

  const doc = new ReportDocument({
    businessUnit: schoolName || "School Management",
    title: pdfAscii(detail.exam.name),
    subtitle: `${APP_NAME} · ${pdfAscii(detail.exam.levelName)} · ${pdfAscii(detail.exam.className)} · ${pdfAscii(periodParts.join(" · ") || "Academic period")}`,
    periodLabel: periodParts.join(" · ") || detail.exam.examDate,
    periodDates: detail.exam.examDate,
    generatedAt: formatPdfGeneratedAt(),
    preparedBy: schoolName || "School Management",
    preparedRole: "Exam results",
    filtersNote: [input.sortLabel, `Maximum marks: ${detail.exam.maxMarks}`, statusNote].filter(Boolean).join(" · "),
  });

  doc.addSimpleTable(columns, tableRows, { sectionTitle: "Results" });
  const safeName = pdfAscii(detail.exam.name).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "exam";
  downloadPdfBytes(doc.build(), `RM-School-Exam-Results-${safeName}.pdf`);
}
