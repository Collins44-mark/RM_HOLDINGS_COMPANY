import { formatTzs } from "@/lib/format/currency";
import type { BeeDirectory } from "@/lib/beekeeping/directory";
import { inWindow } from "@/lib/beekeeping/period";
import { roundKg, roundMoney } from "@/lib/beekeeping/constants";

export type BeeReport = {
  id: string;
  title: string;
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, string>[];
  totals: { label: string; value: string }[];
};

export function buildBeeReport(id: string, directory: BeeDirectory, from: string, to: string): BeeReport {
  const harvests = directory.harvests.filter((row) => row.status === "Valid" && inWindow(row.harvest_date, from, to));
  const sales = directory.sales.filter((row) => inWindow(row.sale_date, from, to));
  const expenses = directory.expenses.filter((row) => inWindow(row.expense_date, from, to));
  const hives = directory.hives.filter((row) => row.status !== "Archived");
  if (id === "bee-hive-details") {
    return {
      id, title: "Beehive Details",
      columns: [{ key: "hive", label: "Hive" }, { key: "location", label: "Location" }, { key: "type", label: "Type" }, { key: "status", label: "Status" }, { key: "harvested", label: "Harvested", align: "right" }, { key: "notes", label: "Notes" }],
      rows: hives.map((hive) => ({ hive: hive.hive_code, location: hive.location, type: hive.hive_type, status: hive.status, harvested: `${hive.total_harvested} kg`, notes: hive.notes })),
      totals: [{ label: "Hives", value: String(hives.length) }],
    };
  }
  if (id === "bee-harvests" || id === "bee-production") {
    return {
      id, title: id === "bee-production" ? "Honey Production Summary" : "Honey Harvest Records",
      columns: [{ key: "ref", label: "Harvest" }, { key: "hive", label: "Hive" }, { key: "date", label: "Date" }, { key: "qty", label: "Kg", align: "right" }, { key: "quality", label: "Quality" }],
      rows: harvests.map((row) => ({ ref: row.harvest_code, hive: row.hive_code, date: row.harvest_date, qty: String(row.quantity_kg), quality: row.quality })),
      totals: [{ label: "Harvested", value: `${roundKg(harvests.reduce((sum, row) => sum + row.quantity_kg, 0))} kg` }],
    };
  }
  if (id === "bee-sales") {
    return {
      id, title: "Honey Sales",
      columns: [{ key: "ref", label: "Sale" }, { key: "date", label: "Date" }, { key: "customer", label: "Customer" }, { key: "qty", label: "Kg", align: "right" }, { key: "total", label: "Total", align: "right" }, { key: "received", label: "Received", align: "right" }, { key: "status", label: "Status" }],
      rows: sales.map((row) => ({ ref: row.sale_code, date: row.sale_date, customer: row.customer_name, qty: String(row.quantity_kg), total: formatTzs(row.total_amount), received: formatTzs(row.amount_received), status: row.status })),
      totals: [{ label: "Received", value: formatTzs(roundMoney(sales.reduce((sum, row) => sum + row.amount_received, 0))) }],
    };
  }
  if (id === "bee-stock") {
    return {
      id, title: "Honey Stock",
      columns: [{ key: "item", label: "Item" }, { key: "value", label: "Value", align: "right" }],
      rows: [
        { item: "Valid honey harvested", value: `${directory.stock.harvested} kg` },
        { item: "Allocated to sales", value: `${directory.stock.sold} kg` },
        { item: "Available stock", value: `${directory.stock.available} kg` },
      ],
      totals: [{ label: "Available", value: `${directory.stock.available} kg` }],
    };
  }
  if (id === "bee-expenses") {
    return {
      id, title: "Beekeeping Expenses",
      columns: [{ key: "ref", label: "Expense" }, { key: "date", label: "Date" }, { key: "category", label: "Category" }, { key: "amount", label: "Amount", align: "right" }, { key: "paid", label: "Paid", align: "right" }, { key: "status", label: "Status" }],
      rows: expenses.map((row) => ({ ref: row.expense_code, date: row.expense_date, category: row.category, amount: formatTzs(row.amount), paid: formatTzs(row.amount_paid), status: row.status })),
      totals: [{ label: "Paid", value: formatTzs(roundMoney(expenses.reduce((sum, row) => sum + row.amount_paid, 0))) }],
    };
  }
  if (id === "bee-financial") {
    const income = roundMoney(directory.sales.flatMap((sale) => sale.payments).filter((payment) => payment.status === "Completed" && inWindow(payment.payment_date, from, to)).reduce((sum, payment) => sum + payment.amount, 0));
    const paid = roundMoney(directory.expenses.flatMap((expense) => expense.payments).filter((payment) => payment.status === "Completed" && inWindow(payment.payment_date, from, to)).reduce((sum, payment) => sum + payment.amount, 0));
    return {
      id, title: "Beekeeping Financial Summary",
      columns: [{ key: "item", label: "Item" }, { key: "value", label: "Value", align: "right" }],
      rows: [
        { item: "Collected sales income", value: formatTzs(income) },
        { item: "Paid expenses", value: formatTzs(paid) },
        { item: "Operating result", value: formatTzs(roundMoney(income - paid)) },
      ],
      totals: [{ label: "Operating result", value: formatTzs(roundMoney(income - paid)) }],
    };
  }
  return {
    id: "bee-hives", title: "All Beehives",
    columns: [{ key: "hive", label: "Hive" }, { key: "name", label: "Name" }, { key: "location", label: "Location" }, { key: "type", label: "Type" }, { key: "status", label: "Status" }, { key: "harvested", label: "Harvested", align: "right" }],
    rows: hives.map((hive) => ({ hive: hive.hive_code, name: hive.hive_name, location: hive.location, type: hive.hive_type, status: hive.status, harvested: `${hive.total_harvested} kg` })),
    totals: [{ label: "Hives", value: String(hives.length) }],
  };
}
