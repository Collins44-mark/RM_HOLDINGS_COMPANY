import { formatPdfGeneratedAt, pdfAscii, type PdfAlign, type TableColumn } from "@/lib/pdf/report-document";
import { FormalReportDocument } from "@/lib/pdf/formal-layout";
import type { SchoolReportWorkspace } from "@/lib/school/report-types";
import { SCHOOL_REPORT_DEFS } from "@/lib/school/report-types";

type Spec = {
  key: string;
  label: string;
  min: number;
  weight: number;
  align?: PdfAlign;
};

function allocate(specs: Spec[], total: number): TableColumn[] {
  const minSum = specs.reduce((sum, spec) => sum + spec.min, 0);
  if (minSum > total) {
    const scale = total / minSum;
    const columns = specs.map((spec) => ({
      key: spec.key,
      label: spec.label,
      width: spec.min * scale,
      align: spec.align ?? "left",
    }));
    const used = columns.reduce((sum, col) => sum + col.width, 0);
    columns[columns.length - 1].width += total - used;
    return columns;
  }
  const extra = total - minSum;
  const weightSum = specs.reduce((sum, spec) => sum + spec.weight, 0) || 1;
  const columns = specs.map((spec) => ({
    key: spec.key,
    label: spec.label,
    width: spec.min + extra * (spec.weight / weightSum),
    align: spec.align ?? "left",
  }));
  const used = columns.reduce((sum, col) => sum + col.width, 0);
  columns[columns.length - 1].width += total - used;
  return columns;
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

function columnsFor(
  workspace: SchoolReportWorkspace,
  contentW: number,
): { columns: TableColumn[]; rows: Array<Record<string, string>> } {
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
        contentW,
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
        contentW,
      ),
      rows: numbered(source),
    };
  }

  if (kind === "parents") {
    return {
      columns: allocate(
        [
          { key: "no", label: "No.", min: 26, weight: 0.3, align: "center" },
          { key: "guardian", label: "Guardian", min: 118, weight: 1.7 },
          { key: "phone", label: "Phone", min: 78, weight: 0.9 },
          { key: "email", label: "Email", min: 148, weight: 2 },
          { key: "student", label: "Student", min: 118, weight: 1.7 },
          { key: "level", label: "Level", min: 70, weight: 0.8 },
          { key: "className", label: "Class", min: 62, weight: 0.7 },
          { key: "stream", label: "Stream", min: 48, weight: 0.5, align: "center" },
        ],
        contentW,
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
    return { columns: allocate(specs, contentW), rows: mapped };
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
        contentW,
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
        contentW,
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
      contentW,
    ),
    rows: numbered(source),
  };
}

export function buildSchoolReportPdf(workspace: SchoolReportWorkspace) {
  const def = SCHOOL_REPORT_DEFS.find((item) => item.id === workspace.kind);
  const schoolName = pdfAscii(workspace.schoolName).trim() || "School Management";
  const periodDates = workspace.from && workspace.to ? `${workspace.from} to ${workspace.to}` : workspace.periodLabel;
  const doc = new FormalReportDocument({
    orientation: "landscape",
    brandName: schoolName,
    businessUnit: placementLine(workspace.rows) || "School Management",
    title: def?.label ?? "School Report",
    subtitle: def?.description ?? "",
    periodLabel: workspace.periodLabel,
    periodDates,
    generatedAt: formatPdfGeneratedAt(),
    footerLeft: schoolName,
  });
  const layout = columnsFor(workspace, doc.contentW);
  doc.addMetrics(workspace.cards);
  doc.addTable(layout.columns, layout.rows);
  return doc.build();
}
