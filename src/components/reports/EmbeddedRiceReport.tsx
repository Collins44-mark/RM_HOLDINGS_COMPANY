import { loadRiceReportsWorkspaceAction } from "@/actions/rice/workspace";
import { ReportDataTable, ReportEmptyState, ReportResultHeader, ReportSurface } from "@/components/reports/report-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";

function kg(value: number) {
  return `${new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 2 }).format(value)} kg`;
}

export async function EmbeddedRiceReport({
  reportId,
  period,
  from,
  to,
}: {
  reportId: string;
  period: ReportPeriod;
  from?: string;
  to?: string;
}) {
  const loaded = await loadRiceReportsWorkspaceAction({ period, from, to });
  if (!loaded.ok) {
    return <ReportEmptyState title="Report could not be loaded" description={loaded.error} />;
  }
  const data = loaded.workspace;
  const summary = data.summary;
  const tables: Record<string, { title: string; columns: { key: string; label: string }[]; rows: Record<string, string>[] }> = {
    "rice-summary": {
      title: "Financial Summary",
      columns: [
        { key: "item", label: "Item" },
        { key: "value", label: "Amount" },
      ],
      rows: [
        { item: "Purchases", value: formatTzs(summary.purchasesTotal) },
        { item: "Sales", value: formatTzs(summary.salesTotal) },
        { item: "Service income", value: formatTzs(summary.serviceIncome) },
        { item: "Cost of goods", value: formatTzs(summary.cogs) },
        { item: "Production loss", value: formatTzs(summary.productionLoss) },
        { item: "Expenses", value: formatTzs(summary.expenses) },
        { item: "Inventory value", value: formatTzs(summary.inventoryValue) },
        { item: "Payables", value: formatTzs(summary.payables) },
        { item: "Receivables", value: formatTzs(summary.receivables) },
        { item: "Net", value: formatTzs(summary.netProfit) },
      ],
    },
    "rice-inventory": {
      title: "Inventory",
      columns: [
        { key: "name", label: "Item" },
        { key: "kind", label: "Kind" },
        { key: "qty", label: "Quantity" },
        { key: "value", label: "Value" },
      ],
      rows: data.items.map((row) => ({ name: row.name, kind: row.kind, qty: kg(row.qtyKg), value: formatTzs(row.valueTzs) })),
    },
    "rice-purchases": {
      title: "Purchases",
      columns: [
        { key: "date", label: "Date" },
        { key: "number", label: "Purchase" },
        { key: "party", label: "Supplier" },
        { key: "qty", label: "Quantity" },
        { key: "total", label: "Total" },
        { key: "paid", label: "Paid" },
      ],
      rows: data.purchases.map((row) => ({
        date: row.occurredOn,
        number: row.number,
        party: row.partyName,
        qty: kg(row.qtyKg),
        total: formatTzs(row.total),
        paid: formatTzs(row.paid),
      })),
    },
    "rice-production": {
      title: "Milling & Production",
      columns: [
        { key: "date", label: "Date" },
        { key: "number", label: "Batch" },
        { key: "input", label: "Paddy in" },
        { key: "output", label: "Output" },
        { key: "waste", label: "Wastage" },
        { key: "cost", label: "Cost" },
      ],
      rows: data.batches.map((row) => ({
        date: row.producedOn,
        number: row.number,
        input: kg(row.inputQtyKg),
        output: row.outputs.map((item) => `${item.itemName} ${kg(item.qtyKg)}`).join(", ") || "—",
        waste: kg(row.wastageKg),
        cost: formatTzs(row.processingCost),
      })),
    },
    "rice-sales": {
      title: "Sales",
      columns: [
        { key: "date", label: "Date" },
        { key: "number", label: "Sale" },
        { key: "party", label: "Buyer" },
        { key: "total", label: "Total" },
        { key: "paid", label: "Paid" },
        { key: "balance", label: "Balance" },
      ],
      rows: data.sales.map((row) => ({
        date: row.occurredOn,
        number: row.number,
        party: row.partyName,
        total: formatTzs(row.total),
        paid: formatTzs(row.paid),
        balance: formatTzs(row.balance),
      })),
    },
    "rice-services": {
      title: "Service Income",
      columns: [
        { key: "date", label: "Date" },
        { key: "number", label: "Number" },
        { key: "kind", label: "Type" },
        { key: "party", label: "Customer" },
        { key: "amount", label: "Amount" },
      ],
      rows: data.services.map((row) => ({
        date: row.occurredOn,
        number: row.number,
        kind: row.kind,
        party: row.partyName || "—",
        amount: formatTzs(row.amount),
      })),
    },
    "rice-expenses": {
      title: "Expenses",
      columns: [
        { key: "date", label: "Date" },
        { key: "number", label: "Number" },
        { key: "kind", label: "Type" },
        { key: "amount", label: "Amount" },
        { key: "notes", label: "Notes" },
      ],
      rows: data.expenses.map((row) => ({
        date: row.occurredOn,
        number: row.number,
        kind: row.kind,
        amount: formatTzs(row.amount),
        notes: row.notes || "—",
      })),
    },
    "rice-storage": {
      title: "Customer Storage",
      columns: [
        { key: "account", label: "Account" },
        { key: "party", label: "Customer" },
        { key: "qty", label: "Balance" },
      ],
      rows: data.accounts.map((row) => ({ account: row.accountNumber, party: row.partyName, qty: kg(row.qtyKg) })),
    },
  };
  const table = tables[reportId];
  if (!table) {
    return <ReportEmptyState title="Report not available" description="This rice report is not available." />;
  }
  return (
    <ReportSurface className="space-y-4 p-5">
      <ReportResultHeader moduleLabel="Rice" title={table.title} description={data.periodLabel} />
      <ReportDataTable columns={table.columns} rows={table.rows} />
    </ReportSurface>
  );
}
