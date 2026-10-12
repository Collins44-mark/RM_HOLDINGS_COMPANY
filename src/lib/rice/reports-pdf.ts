import { APP_NAME } from "@/lib/config/app";
import { formatTzs } from "@/lib/format/currency";
import { downloadPdfBytes, formatPdfGeneratedAt } from "@/lib/pdf/report-document";
import { FormalReportDocument } from "@/lib/pdf/formal-layout";
import type { RiceReportsWorkspace } from "@/actions/rice/workspace";

function kg(value: number) {
  return `${new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 2 }).format(value)} kg`;
}

export function downloadRiceReportsPdf(workspace: RiceReportsWorkspace) {
  const doc = new FormalReportDocument({
    orientation: "landscape",
    brandName: APP_NAME,
    businessUnit: "Rice Mill & Warehouse",
    title: "Rice Mill & Warehouse Report",
    subtitle: "Posted purchases, production, inventory, customer storage, sales, service income, and expenses.",
    periodLabel: workspace.periodLabel,
    periodDates: workspace.periodLabel,
    generatedAt: formatPdfGeneratedAt(),
    footerLeft: "Rice Mill & Warehouse",
  });
  doc.addMetrics([
    { label: "Purchases", value: formatTzs(workspace.summary.purchasesTotal) },
    { label: "Sales", value: formatTzs(workspace.summary.salesTotal) },
    { label: "Service income", value: formatTzs(workspace.summary.serviceIncome) },
    { label: "Expenses", value: formatTzs(workspace.summary.expenses) },
    { label: "Net profit", value: formatTzs(workspace.summary.netProfit) },
  ]);
  doc.addSectionTable(
    "Purchases",
    [
      { key: "date", label: "Date", width: 80 },
      { key: "number", label: "No.", width: 80 },
      { key: "party", label: "Supplier", width: 140 },
      { key: "qty", label: "Qty", width: 80 },
      { key: "total", label: "Total", width: 90 },
      { key: "paid", label: "Paid", width: 90 },
      { key: "balance", label: "Payable", width: 90 },
    ],
    workspace.purchases.map((row) => ({
      date: row.occurredOn,
      number: row.number,
      party: row.partyName,
      qty: kg(row.qtyKg),
      total: formatTzs(row.total),
      paid: formatTzs(row.paid),
      balance: formatTzs(row.balance),
    })),
    { emptyMessage: "No purchases in this period." },
  );
  doc.addSectionTable(
    "Production",
    [
      { key: "date", label: "Date", width: 80 },
      { key: "number", label: "Batch", width: 80 },
      { key: "input", label: "Paddy in", width: 90 },
      { key: "output", label: "Outputs", width: 260 },
      { key: "waste", label: "Wastage", width: 80 },
      { key: "cost", label: "Cost", width: 90 },
    ],
    workspace.batches.map((row) => ({
      date: row.producedOn,
      number: row.number,
      input: kg(row.inputQtyKg),
      output: row.outputs.map((item) => `${item.itemName} ${kg(item.qtyKg)}`).join("; ") || "—",
      waste: kg(row.wastageKg),
      cost: formatTzs(row.processingCost),
    })),
    { emptyMessage: "No milling batches in this period." },
  );
  doc.addSectionTable(
    "Current inventory",
    [
      { key: "name", label: "Item", width: 220 },
      { key: "kind", label: "Kind", width: 120 },
      { key: "qty", label: "Quantity", width: 120 },
    ],
    workspace.items.map((row) => ({ name: row.name, kind: row.kind, qty: kg(row.qtyKg) })),
    { emptyMessage: "No inventory items configured." },
  );
  doc.addSectionTable(
    "Customer storage balances",
    [
      { key: "account", label: "Account", width: 100 },
      { key: "party", label: "Customer", width: 200 },
      { key: "qty", label: "Balance", width: 120 },
    ],
    workspace.accounts.map((row) => ({ account: row.accountNumber, party: row.partyName, qty: kg(row.qtyKg) })),
    { emptyMessage: "No customer storage accounts." },
  );
  doc.addSectionTable(
    "Sales",
    [
      { key: "date", label: "Date", width: 80 },
      { key: "number", label: "No.", width: 80 },
      { key: "party", label: "Buyer", width: 160 },
      { key: "total", label: "Total", width: 90 },
      { key: "paid", label: "Paid", width: 90 },
      { key: "balance", label: "Receivable", width: 100 },
    ],
    workspace.sales.map((row) => ({
      date: row.occurredOn,
      number: row.number,
      party: row.partyName,
      total: formatTzs(row.total),
      paid: formatTzs(row.paid),
      balance: formatTzs(row.balance),
    })),
    { emptyMessage: "No sales in this period." },
  );
  doc.addSectionTable(
    "Service income",
    [
      { key: "date", label: "Date", width: 80 },
      { key: "number", label: "No.", width: 90 },
      { key: "kind", label: "Type", width: 100 },
      { key: "party", label: "Customer", width: 180 },
      { key: "amount", label: "Amount", width: 100 },
    ],
    workspace.services.map((row) => ({
      date: row.occurredOn,
      number: row.number,
      kind: row.kind,
      party: row.partyName ?? "—",
      amount: formatTzs(row.amount),
    })),
    { emptyMessage: "No service income in this period." },
  );
  doc.addSectionTable(
    "Operating expenses",
    [
      { key: "date", label: "Date", width: 80 },
      { key: "number", label: "No.", width: 90 },
      { key: "kind", label: "Type", width: 120 },
      { key: "amount", label: "Amount", width: 100 },
      { key: "notes", label: "Notes", width: 250 },
    ],
    workspace.expenses.map((row) => ({
      date: row.occurredOn,
      number: row.number,
      kind: row.kind,
      amount: formatTzs(row.amount),
      notes: row.notes ?? "—",
    })),
    { emptyMessage: "No expenses in this period." },
  );
  downloadPdfBytes(doc.build(), `rice-mill-report-${workspace.periodLabel.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

export function downloadRiceReportsCsv(workspace: RiceReportsWorkspace) {
  const lines = [
    ["Purchases"],
    ["Date", "Number", "Supplier", "Qty kg", "Total", "Paid", "Payable"],
    ...workspace.purchases.map((row) => [row.occurredOn, row.number, row.partyName, row.qtyKg, row.total, row.paid, row.balance]),
    [],
    ["Sales"],
    ["Date", "Number", "Buyer", "Total", "Paid", "Receivable"],
    ...workspace.sales.map((row) => [row.occurredOn, row.number, row.partyName, row.total, row.paid, row.balance]),
    [],
    ["Service income"],
    ["Date", "Number", "Type", "Amount"],
    ...workspace.services.map((row) => [row.occurredOn, row.number, row.kind, row.amount]),
    [],
    ["Expenses"],
    ["Date", "Number", "Type", "Amount"],
    ...workspace.expenses.map((row) => [row.occurredOn, row.number, row.kind, row.amount]),
  ];
  const csv = lines.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "rice-mill-report.csv";
  link.click();
  URL.revokeObjectURL(url);
}
