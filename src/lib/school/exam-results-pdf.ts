import type { SchoolExamDetail } from "@/actions/school/exams";
import { downloadPdfBytes, formatPdfGeneratedAt, pdfAscii, type TableColumn } from "@/lib/pdf/report-document";
import { FormalReportDocument } from "@/lib/pdf/formal-layout";
import { formatExamAverage, formatExamPosition, roundExamAverage } from "@/lib/school/exam-ranking";

export type ExamResultsPdfRow = {
  studentName: string;
  marks: Array<number | null>;
  grade: string;
  average: number | null;
  position: number | null;
};

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
    .join("  |  ");
}

function examTitle(detail: SchoolExamDetail) {
  return pdfAscii(detail.exam.name).trim() || "Results";
}

export function buildExamResultsPdf(input: {
  detail: SchoolExamDetail;
  schoolName: string;
  rows: ExamResultsPdfRow[];
  sortLabel?: string;
}) {
  const { detail, rows } = input;
  const schoolName = pdfAscii(input.schoolName).trim() || "School Management";
  const subjectCount = detail.subjects.length;
  const noWidth = 28;
  const gradeWidth = 36;
  const avgWidth = 38;
  const posWidth = 44;
  const contentW = 770;
  const studentWidth = Math.min(160, Math.max(102, contentW * 0.19 - Math.min(subjectCount, 10) * 2));
  const remaining = Math.max(80, contentW - noWidth - studentWidth - gradeWidth - avgWidth - posWidth);
  const subjectWidth = subjectCount > 0 ? remaining / subjectCount : remaining;

  const columns: TableColumn[] = [
    { key: "no", label: "No.", width: noWidth, align: "center" },
    { key: "student", label: "Student", width: studentWidth, align: "left" },
    ...detail.subjects.map((subject, index) => ({
      key: `s${index}`,
      label: pdfAscii(subject.name),
      width: subjectWidth,
      align: "center" as const,
    })),
    { key: "avg", label: "Avg.", width: avgWidth, align: "center" },
    { key: "grade", label: "Grade", width: gradeWidth, align: "center" },
    { key: "position", label: "Position", width: posWidth, align: "center" },
  ];

  const tableRows = rows.map((row, index) => {
    const next: Record<string, string> = {
      no: String(index + 1),
      student: row.studentName,
      grade: row.grade,
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
    grade: "",
    avg: formatExamAverage(averages.overall),
    position: "",
  };
  averages.subjects.forEach((value, index) => {
    averageRow[`s${index}`] = formatExamAverage(value);
  });

  const doc = new FormalReportDocument({
    orientation: "landscape",
    brandName: schoolName,
    businessUnit: academicLine(detail) || "School Management",
    title: examTitle(detail),
    subtitle: input.sortLabel ? `Sorted by ${input.sortLabel}` : "Examination results",
    periodLabel: detail.exam.termName || detail.exam.yearName || "Exam",
    periodDates: detail.exam.examDate || detail.exam.yearName,
    generatedAt: formatPdfGeneratedAt(),
    footerLeft: schoolName,
  });
  doc.addTable(columns, tableRows, { totalRow: averageRow });
  return doc.build();
}

export function downloadExamResultsPdf(input: {
  detail: SchoolExamDetail;
  schoolName: string;
  rows: ExamResultsPdfRow[];
  sortLabel?: string;
}) {
  const safeName = pdfAscii(input.detail.exam.name).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "exam";
  downloadPdfBytes(buildExamResultsPdf(input), `RM-School-Exam-Results-${safeName}.pdf`);
}
