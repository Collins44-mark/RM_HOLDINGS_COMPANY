import type { LivestockDirectory } from "@/lib/livestock/directory";
import { inLivestockWindow } from "@/lib/livestock/period";

export type LivestockReport = { title: string; columns: Array<{ key: string; label: string }>; rows: Array<Record<string, string>>; totals: Array<{ label: string; value: string }> };

const money = (value: number) => new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(value || 0);

export function buildLivestockReport(reportId: string, data: LivestockDirectory, from: string, to: string, animalType = "", houseId = ""): LivestockReport {
  const inRange = (date: string) => inLivestockWindow(date, from, to);
  const typeOk = (name: string) => !animalType || name === animalType;
  const stock = data.stock.filter((row) => typeOk(row.name));
  if (reportId === "ls-inventory") return table("Livestock Inventory", ["Type", "Current", "Pregnant", "Purchased", "Born", "Sold", "Deaths"], stock.map((row) => [row.name, row.current, row.pregnant, row.purchased, row.born, row.sold, row.deaths]), [["Animal types", String(stock.length)]]);
  if (reportId === "ls-purchases") {
    const rows = data.purchases.filter((row) => row.status === "Valid" && inRange(row.purchase_date) && typeOk(row.animal_type));
    return table("Livestock Purchases", ["Reference", "Date", "Type", "Qty", "Cost"], rows.map((row) => [row.purchase_code, String(row.purchase_date).slice(0, 10), row.animal_type, row.quantity, money(Number(row.total_cost))]), [["Purchases", String(rows.length)]]);
  }
  if (reportId === "ls-pregnancy") {
    const rows = data.pregnancies.filter((row) => row.status === "Active" && typeOk(row.animal_type));
    return table("Pregnancy", ["Type", "Quantity", "Date", "Expected"], rows.map((row) => [row.animal_type, row.quantity, row.pregnancy_date ? String(row.pregnancy_date).slice(0, 10) : "", row.expected_date ? String(row.expected_date).slice(0, 10) : ""]), [["Pregnant records", String(rows.length)]]);
  }
  if (reportId === "ls-births") {
    const rows = data.births.filter((row) => row.status === "Valid" && inRange(row.birth_date) && typeOk(row.animal_type));
    return table("Births", ["Type", "Mothers", "Offspring", "Date"], rows.map((row) => [row.animal_type, row.mothers, row.offspring, String(row.birth_date).slice(0, 10)]), [["Offspring", String(rows.reduce((sum, row) => sum + Number(row.offspring), 0))]]);
  }
  if (reportId === "ls-movements") {
    const rows = data.movements.filter((row) => inRange(row.movement_date) && typeOk(row.animal_type));
    return table("Livestock Movements", ["Date", "Type", "Movement", "In", "Out"], rows.map((row) => [String(row.movement_date).slice(0, 10), row.animal_type, row.movement_type, row.quantity_in, row.quantity_out]), [["Movements", String(rows.length)]]);
  }
  if (reportId === "ls-sales") {
    const rows = data.sales.filter((row) => row.status !== "Cancelled" && inRange(row.sale_date) && typeOk(row.animal_type));
    return table("Livestock Sales", ["Reference", "Date", "Type", "Qty", "Total", "Received", "Balance"], rows.map((row) => [row.sale_code, String(row.sale_date).slice(0, 10), row.animal_type, row.quantity, money(Number(row.total_amount)), money(row.amount_received), money(row.balance)]), [["Collected", money(rows.reduce((sum, row) => sum + row.amount_received, 0))]]);
  }
  if (reportId === "ls-houses") return table("Poultry Houses", ["House", "Location", "Status", "Tenant", "Rent"], data.houses.filter((row) => !houseId || row.id === houseId).map((row) => [row.house_name, row.location, row.status, row.tenant_name, money(Number(row.monthly_rent))]), [["Houses", String(data.houses.length)]]);
  if (reportId === "ls-rent") {
    const payments = data.rentals.filter((row) => !houseId || row.house_id === houseId).flatMap((row) => row.payments.map((payment) => ({ ...payment, house: row.house_name, tenant: row.tenant_name }))).filter((payment) => payment.status === "Completed" && inRange(payment.payment_date));
    return table("Rental Income", ["Date", "House", "Tenant", "Amount"], payments.map((row) => [String(row.payment_date).slice(0, 10), row.house, row.tenant, money(Number(row.amount))]), [["Received", money(payments.reduce((sum, row) => sum + Number(row.amount), 0))]]);
  }
  if (reportId === "ls-expenses") {
    const rows = data.expenses.filter((row) => row.status !== "Cancelled" && inRange(row.expense_date));
    return table("Livestock Expenses", ["Reference", "Date", "Category", "Amount", "Paid", "Balance"], rows.map((row) => [row.expense_code, String(row.expense_date).slice(0, 10), row.category, money(Number(row.amount)), money(row.amount_paid), money(row.balance)]), [["Paid", money(rows.reduce((sum, row) => sum + row.amount_paid, 0))]]);
  }
  const salesPaid = data.sales.flatMap((row) => row.payments).filter((row) => row.status === "Completed" && inRange(row.payment_date)).reduce((sum, row) => sum + Number(row.amount), 0);
  const rentPaid = data.rentals.flatMap((row) => row.payments).filter((row) => row.status === "Completed" && inRange(row.payment_date)).reduce((sum, row) => sum + Number(row.amount), 0);
  const expensesPaid = data.expenses.flatMap((row) => row.payments).filter((row) => row.status === "Completed" && inRange(row.payment_date)).reduce((sum, row) => sum + Number(row.amount), 0);
  return table("Livestock Financial Summary", ["Item", "Amount"], [["Sales collected", money(salesPaid)], ["Rent collected", money(rentPaid)], ["Expenses paid", money(expensesPaid)], ["Net cash result", money(salesPaid + rentPaid - expensesPaid)]], [["Net", money(salesPaid + rentPaid - expensesPaid)]]);
}

function table(title: string, headers: string[], rows: Array<Array<string | number>>, totals: Array<[string, string]>): LivestockReport {
  const columns = headers.map((label, index) => ({ key: `c${index}`, label }));
  return {
    title,
    columns,
    rows: rows.map((row) => Object.fromEntries(row.map((value, index) => [`c${index}`, String(value)]))),
    totals: totals.map(([label, value]) => ({ label, value })),
  };
}
