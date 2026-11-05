import { loadFarmReportsWorkspaceAction } from "@/actions/farm/workspace";
import { ReportDataTable, ReportEmptyState, ReportResultHeader, ReportSurface } from "@/components/reports/report-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";

export async function EmbeddedFarmReport({
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
  const loaded = await loadFarmReportsWorkspaceAction({ period, from, to });
  if (!loaded.ok) {
    return <ReportEmptyState title="Report could not be loaded" description={loaded.error} />;
  }
  const data = loaded.workspace;
  const summary = data.summary;
  const tables: Record<string, { title: string; columns: { key: string; label: string }[]; rows: Record<string, string>[] }> = {
    "farm-summary": {
      title: "Financial Summary",
      columns: [
        { key: "item", label: "Item" },
        { key: "value", label: "Amount" },
      ],
      rows: [
        { item: "Service income", value: formatTzs(summary.serviceIncome) },
        { item: "Received", value: formatTzs(summary.received) },
        { item: "Receivables", value: formatTzs(summary.receivables) },
        { item: "Fuel", value: formatTzs(summary.fuelExpense) },
        { item: "Maintenance", value: formatTzs(summary.maintenanceExpense) },
        { item: "Expenses", value: formatTzs(summary.expenses) },
        { item: "Net", value: formatTzs(summary.netProfit) },
        { item: "Completed jobs", value: String(summary.completedJobs) },
      ],
    },
    "farm-jobs": {
      title: "Farm Services",
      columns: [
        { key: "date", label: "Date" },
        { key: "number", label: "Job" },
        { key: "customer", label: "Customer" },
        { key: "service", label: "Service" },
        { key: "price", label: "Price" },
        { key: "paid", label: "Paid" },
        { key: "status", label: "Status" },
      ],
      rows: data.jobs.map((row) => ({
        date: row.occurredOn,
        number: row.number,
        customer: row.partyName,
        service: row.serviceName,
        price: formatTzs(row.agreedPrice),
        paid: formatTzs(row.amountPaid),
        status: row.status,
      })),
    },
    "farm-tractors": {
      title: "Tractors & Equipment",
      columns: [
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        { key: "registration", label: "Registration" },
        { key: "status", label: "Status" },
        { key: "hours", label: "Hour meter" },
      ],
      rows: data.tractors.map((row) => ({
        code: row.code,
        name: row.name,
        registration: row.registrationNumber || "—",
        status: row.status,
        hours: String(row.hourMeter),
      })),
    },
    "farm-fuel": {
      title: "Fuel",
      columns: [
        { key: "date", label: "Date" },
        { key: "number", label: "Number" },
        { key: "tractor", label: "Tractor" },
        { key: "litres", label: "Litres" },
        { key: "total", label: "Cost" },
      ],
      rows: data.fuel.map((row) => ({
        date: row.occurredOn,
        number: row.number,
        tractor: row.tractorName,
        litres: String(row.litres),
        total: formatTzs(row.totalCost),
      })),
    },
    "farm-maintenance": {
      title: "Maintenance",
      columns: [
        { key: "date", label: "Date" },
        { key: "number", label: "Number" },
        { key: "tractor", label: "Tractor" },
        { key: "category", label: "Category" },
        { key: "total", label: "Cost" },
      ],
      rows: data.maintenance.map((row) => ({
        date: row.occurredOn,
        number: row.number,
        tractor: row.tractorName,
        category: row.category,
        total: formatTzs(row.totalCost),
      })),
    },
    "farm-operations": {
      title: "Company Farm",
      columns: [
        { key: "date", label: "Date" },
        { key: "number", label: "Number" },
        { key: "plot", label: "Plot" },
        { key: "activity", label: "Activity" },
        { key: "cost", label: "Cost" },
      ],
      rows: data.operations.map((row) => ({
        date: row.occurredOn,
        number: row.number,
        plot: row.plotName || "—",
        activity: row.activity,
        cost: formatTzs(row.cost),
      })),
    },
    "farm-expenses": {
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
  };
  const table = tables[reportId];
  if (!table) {
    return <ReportEmptyState title="Report not available" description="This farm report is not available." />;
  }
  return (
    <ReportSurface className="space-y-4 p-5">
      <ReportResultHeader moduleLabel="Farm" title={table.title} description={data.periodLabel} />
      <ReportDataTable columns={table.columns} rows={table.rows} />
    </ReportSurface>
  );
}
