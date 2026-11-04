import { notFound } from "next/navigation";
import { listInvoiceDirectory } from "@/lib/property/invoice-directory";
import { formatTzs } from "@/lib/format/currency";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export default async function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const directory = await listInvoiceDirectory();
  const invoice = directory.invoices.find((item) => item.id === id);
  if (!invoice) notFound();
  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-slate-900">
      <div className="flex items-start justify-between gap-6 pb-6">
        <div>
          <p className="text-sm font-semibold text-slate-500">RM Holdings Ltd</p>
          <h1 className="mt-1 text-3xl font-extrabold">Rent Invoice</h1>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{invoice.invoice_number}</p>
          <p className="text-sm text-slate-500">{invoice.effective_status}</p>
        </div>
      </div>
      <section className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <p><span className="text-slate-500">Tenant</span><br /><strong>{invoice.tenant_name}</strong></p>
        <p><span className="text-slate-500">Property / Unit</span><br /><strong>{invoice.property_name} / {invoice.unit_name}</strong></p>
        <p><span className="text-slate-500">Billing period</span><br /><strong>{formatDate(invoice.billing_period_start)} – {formatDate(invoice.billing_period_end)}</strong></p>
        <p><span className="text-slate-500">Due date</span><br /><strong>{formatDate(invoice.due_date)}</strong></p>
        <p><span className="text-slate-500">Contract</span><br /><strong>{invoice.contract_number}</strong></p>
        <p><span className="text-slate-500">Invoice date</span><br /><strong>{formatDate(invoice.issue_date)}</strong></p>
      </section>
      <table className="mt-8 w-full text-sm">
        <thead><tr className="text-left text-slate-500"><th className="py-2">Description</th><th className="py-2 text-right">Amount</th></tr></thead>
        <tbody>
          <tr><td className="py-2">Rent</td><td className="py-2 text-right">{formatTzs(invoice.rent_amount)}</td></tr>
          <tr><td className="py-2">Additional charges</td><td className="py-2 text-right">{formatTzs(invoice.additional_charges)}</td></tr>
          <tr><td className="py-2">Discount</td><td className="py-2 text-right">{formatTzs(invoice.discount)}</td></tr>
          <tr><td className="py-2 font-bold">Total</td><td className="py-2 text-right font-bold">{formatTzs(invoice.total_amount)}</td></tr>
          <tr><td className="py-2">Paid</td><td className="py-2 text-right">{formatTzs(invoice.amount_paid)}</td></tr>
          <tr><td className="py-2 font-bold">Outstanding</td><td className="py-2 text-right font-bold">{formatTzs(invoice.balance)}</td></tr>
        </tbody>
      </table>
      <button type="button" className="print-button mt-8 rounded-xl bg-[#0b2244] px-4 py-2 text-white">Print</button>
      <script dangerouslySetInnerHTML={{ __html: "document.querySelector('.print-button')?.addEventListener('click', () => window.print());" }} />
      <style>{`@media print { .print-button { display: none } body { background: white } }`}</style>
    </main>
  );
}
