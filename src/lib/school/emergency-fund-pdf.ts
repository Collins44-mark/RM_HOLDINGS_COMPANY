import { APP_NAME } from "@/lib/config/app";
import { formatTzs } from "@/lib/format/currency";
import { downloadPdfBytes, formatPdfGeneratedAt } from "@/lib/pdf/report-document";
import { FormalReportDocument } from "@/lib/pdf/formal-layout";
import {
  emergencyFundPeriodTotals,
  emergencyFundRunningBalances,
  filterEmergencyFundHistory,
  fundEntryKindLabel,
} from "@/lib/school/emergency-fund";
import type { SchoolEmergencyFund, SchoolEmergencyFundEntry } from "@/lib/school/store-types";

export type EmergencyFundReportInput = {
  schoolName: string;
  periodLabel: string;
  from: string;
  to: string;
  fund: SchoolEmergencyFund;
};

function csvValue(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function historyRows(entries: SchoolEmergencyFundEntry[], from: string, to: string) {
  const running = emergencyFundRunningBalances(entries);
  return filterEmergencyFundHistory(entries, from, to)
    .slice()
    .sort((a, b) => {
      const date = b.occurredOn.localeCompare(a.occurredOn);
      if (date) return date;
      return b.createdAt.localeCompare(a.createdAt);
    })
    .map((entry, index) => ({
      no: String(index + 1),
      date: entry.occurredOn,
      type: fundEntryKindLabel(entry.kind),
      added: entry.kind === "SPEND" ? "—" : formatTzs(entry.amount),
      spent: entry.kind === "SPEND" ? formatTzs(entry.amount) : "—",
      reference: entry.reference || "—",
      notes: entry.notes || "—",
      status: entry.isActive ? "Posted" : "Reversed",
      balance: formatTzs(running.get(entry.id) ?? 0),
    }));
}

export function buildEmergencyFundReportPdf(input: EmergencyFundReportInput) {
  const schoolName = input.schoolName.trim() || "School Management";
  const totals = emergencyFundPeriodTotals(input.fund.entries, input.from, input.to);
  const openings = input.fund.entries.filter((entry) => entry.kind === "OPENING");
  const rows = historyRows(input.fund.entries, input.from, input.to);
  const doc = new FormalReportDocument({
    orientation: "landscape",
    brandName: APP_NAME,
    businessUnit: schoolName,
    title: "School Emergency Fund Report",
    subtitle: "Opening balances and replenishments are not school income. Spending posts one school expense.",
    periodLabel: input.periodLabel,
    periodDates: `${input.from} to ${input.to}`,
    generatedAt: formatPdfGeneratedAt(),
    footerLeft: schoolName,
  });
  doc.addMetrics([
    { label: "Current available balance", value: formatTzs(input.fund.balance) },
    { label: "Period opening balance", value: formatTzs(totals.openingBalance) },
    { label: "Funds added this period", value: formatTzs(totals.added) },
    { label: "Expenditure this period", value: formatTzs(totals.spent) },
    { label: "Period closing balance", value: formatTzs(totals.closingBalance) },
  ]);
  doc.addSectionTable(
    "Opening balance history",
    [
      { key: "date", label: "Date", width: 90 },
      { key: "amount", label: "Amount", width: 110 },
      { key: "reference", label: "Reference", width: 150 },
      { key: "notes", label: "Notes", width: 250 },
      { key: "status", label: "Status", width: 80 },
    ],
    openings.map((entry) => ({
      date: entry.occurredOn,
      amount: formatTzs(entry.amount),
      reference: entry.reference || "—",
      notes: entry.notes || "—",
      status: entry.isActive ? "Posted" : "Reversed",
    })),
    { emptyMessage: "No opening balance has been recorded." },
  );
  doc.addSectionTable(
    "Fund movements",
    [
      { key: "no", label: "No.", width: 28 },
      { key: "date", label: "Date", width: 72 },
      { key: "type", label: "Type", width: 92 },
      { key: "added", label: "Funds added", width: 92 },
      { key: "spent", label: "Expenditure", width: 92 },
      { key: "reference", label: "Reference", width: 90 },
      { key: "notes", label: "Notes", width: 140 },
      { key: "status", label: "Status", width: 62 },
      { key: "balance", label: "Resulting balance", width: 102 },
    ],
    rows,
    { emptyMessage: "No emergency fund movements in this period." },
  );
  return doc.build();
}

export function downloadEmergencyFundReportPdf(input: EmergencyFundReportInput) {
  downloadPdfBytes(buildEmergencyFundReportPdf(input), "RM-School-Emergency-Fund-Report.pdf");
}

export function downloadEmergencyFundReportCsv(input: EmergencyFundReportInput) {
  const totals = emergencyFundPeriodTotals(input.fund.entries, input.from, input.to);
  const rows = historyRows(input.fund.entries, input.from, input.to);
  const header = ["Date", "Type", "Funds added (TZS)", "Expenditure (TZS)", "Reference", "Notes", "Status", "Resulting balance"];
  const body = rows.map((row) => [row.date, row.type, row.added, row.spent, row.reference, row.notes, row.status, row.balance]);
  const summary = [
    [],
    ["Report", "School Emergency Fund Report"],
    ["Period", `${input.periodLabel} (${input.from} to ${input.to})`],
    ["Current available balance", formatTzs(input.fund.balance)],
    ["Period opening balance", formatTzs(totals.openingBalance)],
    ["Funds added this period", formatTzs(totals.added)],
    ["Expenditure this period", formatTzs(totals.spent)],
    ["Period closing balance", formatTzs(totals.closingBalance)],
  ];
  const csv = [header, ...body, ...summary].map((line) => line.map(csvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "RM-School-Emergency-Fund-Report.csv";
  link.click();
  URL.revokeObjectURL(url);
}
