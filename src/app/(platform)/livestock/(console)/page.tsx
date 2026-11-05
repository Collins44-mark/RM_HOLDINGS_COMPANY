import Link from "next/link";
import { listLivestockDirectory } from "@/lib/livestock/directory";
import { inLivestockWindow, livestockPeriod } from "@/lib/livestock/period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Livestock Dashboard" };

export default async function LivestockDashboardPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const period = livestockPeriod(params.period || "month", params.from, params.to);
  const data = await listLivestockDirectory();
  const births = data.births.filter((row) => row.status === "Valid" && inLivestockWindow(row.birth_date, period.from, period.to));
  const offspring = births.reduce((sum, row) => sum + Number(row.offspring), 0);
  const mothers = births.reduce((sum, row) => sum + Number(row.mothers), 0);
  const expected = data.pregnancies.filter((row) => row.status === "Active" && row.expected_date && inLivestockWindow(String(row.expected_date), period.from, period.to)).reduce((sum, row) => sum + Number(row.quantity), 0);
  const purchased = data.movements.filter((row) => row.movement_type === "Purchase" && row.quantity_in > 0 && inLivestockWindow(row.movement_date, period.from, period.to)).reduce((sum, row) => sum + Number(row.quantity_in), 0);
  const sold = data.movements.filter((row) => row.movement_type === "Sale" && row.quantity_out > 0 && inLivestockWindow(row.movement_date, period.from, period.to)).reduce((sum, row) => sum + Number(row.quantity_out), 0);
  const deaths = data.movements.filter((row) => row.movement_type === "Death" && inLivestockWindow(row.movement_date, period.from, period.to)).reduce((sum, row) => sum + Number(row.quantity_out), 0);
  const adjustments = data.movements.filter((row) => row.movement_type === "Adjustment" && inLivestockWindow(row.movement_date, period.from, period.to)).reduce((sum, row) => sum + Number(row.quantity_in) - Number(row.quantity_out), 0);
  const saleIncome = data.sales.flatMap((sale) => sale.payments).filter((payment) => payment.status === "Completed" && inLivestockWindow(payment.payment_date, period.from, period.to)).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const rentalIncome = data.rentals.flatMap((rental) => rental.payments).filter((payment) => payment.status === "Completed" && inLivestockWindow(payment.payment_date, period.from, period.to)).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const expensesPaid = data.expenses.flatMap((expense) => expense.payments).filter((payment) => payment.status === "Completed" && inLivestockWindow(payment.payment_date, period.from, period.to)).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const receivables = data.sales.filter((sale) => sale.status !== "Cancelled").reduce((sum, sale) => sum + sale.balance, 0) + data.rentals.reduce((sum, rental) => sum + rental.balance, 0);
  const payables = data.expenses.filter((expense) => expense.status !== "Cancelled").reduce((sum, expense) => sum + expense.balance, 0);
  const purchaseCosts = data.purchases.filter((row) => row.status === "Valid" && inLivestockWindow(row.purchase_date, period.from, period.to)).reduce((sum, row) => sum + Number(row.total_cost), 0);
  const format = (value: number) => new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(value);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Livestock Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Kigamboni Farm herd quantities, births, poultry rentals, and cash result.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {[["month", "This Month"], ["quarter", "Last 3 Months"], ["year", "This Year"]].map(([value, label]) => (
            <Link key={value} href={`/livestock?period=${value}`} className={`rounded-full px-3 py-1.5 ${params.period === value || (!params.period && value === "month") ? "bg-[#0b2244] text-white" : "bg-white text-slate-600"}`}>{label}</Link>
          ))}
          <form action="/livestock" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="period" value="custom" />
            <input type="date" name="from" defaultValue={params.from || ""} className="rounded-xl border border-slate-200 bg-white px-2 py-1" />
            <input type="date" name="to" defaultValue={params.to || ""} className="rounded-xl border border-slate-200 bg-white px-2 py-1" />
            <button className="rounded-full bg-white px-3 py-1.5 text-slate-600">Custom range</button>
          </form>
        </div>
      </div>
      {data.error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{data.error}</p> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Total Animals" value={String(data.summary.animals)} />
        <Card label="Animal Types" value={String(data.summary.types)} />
        <Card label="Pregnant Animals" value={String(data.summary.pregnant)} />
        <Card label="New Births" value={String(offspring)} hint={period.label} />
      </div>
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800">Livestock breakdown</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead><tr>{["Animal Type", "Current Quantity", "Pregnant Animals", `Births in ${period.label}`].map((header) => <th key={header} className="py-2 text-xs uppercase text-slate-400">{header}</th>)}</tr></thead>
          <tbody>
            {data.stock.filter((row) => row.active).map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="py-2">{row.name}</td>
                <td>{row.current}</td>
                <td>{row.pregnant}</td>
                <td>{births.filter((birth) => birth.animal_type_id === row.id).reduce((sum, birth) => sum + Number(birth.offspring), 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <Info title="Reproduction" rows={[["Pregnant now", String(data.summary.pregnant)], ["Expected deliveries", String(expected)], ["Mothers delivered", String(mothers)], ["Offspring born", String(offspring)]]} />
        <Info title="Movements" rows={[["Purchased", String(purchased)], ["Born", String(offspring)], ["Sold", String(sold)], ["Deaths", String(deaths)], ["Adjustments", String(adjustments)]]} />
        <Info title="Poultry houses" rows={[["Total", String(data.summary.houses)], ["Rented", String(data.summary.rented)], ["Available", String(data.summary.available)], ["Maintenance", String(data.summary.maintenance)], ["Rent received", format(rentalIncome)]]} />
      </section>
      <section className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm lg:grid-cols-4">
        <Mini label="Purchase costs" value={format(purchaseCosts)} />
        <Mini label="Sales income received" value={format(saleIncome)} />
        <Mini label="Rental income received" value={format(rentalIncome)} />
        <Mini label="Expenses paid" value={format(expensesPaid)} />
        <Mini label="Outstanding receivables" value={format(receivables)} />
        <Mini label="Outstanding payables" value={format(payables)} />
        <Mini label="Net cash result" value={format(saleIncome + rentalIncome - expensesPaid)} />
      </section>
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800">Recent activity</h2>
        {data.activities.length === 0 ? <p className="py-6 text-sm text-slate-500">No livestock activity yet.</p> : (
          <ul className="mt-3 space-y-2 text-sm">{data.activities.map((item) => <li key={item.id} className="flex justify-between gap-3"><span>{item.description}</span><span className="text-slate-400">{String(item.created_at).slice(0, 16).replace("T", " ")}</span></li>)}</ul>
        )}
      </section>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs uppercase text-slate-400">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p>{hint ? <p className="text-xs text-slate-400">{hint}</p> : null}</div>;
}
function Info({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-800">{title}</h2><dl className="mt-3 space-y-2 text-sm">{rows.map(([label, value]) => <div key={label} className="flex justify-between"><dt className="text-slate-500">{label}</dt><dd>{value}</dd></div>)}</dl></section>;
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-400">{label}</p><p className="font-semibold text-slate-900">{value}</p></div>;
}
