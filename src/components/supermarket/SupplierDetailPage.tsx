"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { formatTzs } from "@/lib/format/currency";
import { formatDisplayDate, useSupermarketInventory } from "@/lib/data/supermarket-inventory";
import { purchaseOrderGrandTotal, supplierOutstanding, supplierPurchaseTotal } from "@/lib/data/supermarket-purchasing";
import { StatusPill, glassCard, glassPanel, tableHead } from "@/components/supermarket/purchasing-ui";
import { PageBackButton } from "@/components/ui/PageBackButton";

export function SupplierDetailPage() {
  const params = useParams<{ supplierId: string }>();
  const inventory = useSupermarketInventory();
  const supplier = inventory.suppliers.find((item) => item.id === params.supplierId);
  if (!supplier) {
    return (
      <div className="min-w-0 pb-10">
        <PageBackButton href="/supermarket/purchasing?tab=suppliers" prefetch />
        <h1 className="mt-4 text-[24px] font-semibold text-navy">Supplier not found.</h1>
      </div>
    );
  }

  const orders = inventory.purchaseOrders.filter((item) => item.supplierId === supplier.id);
  const purchases = inventory.purchases.filter((item) => item.supplierId === supplier.id);
  const outstanding = supplierOutstanding(supplier.id, inventory.purchases);

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <div>
        <PageBackButton href="/supermarket/purchasing?tab=suppliers" prefetch />
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">{supplier.name}</h1>
            <p className="mt-1.5 text-[13px] text-slate-500">{supplier.address || "No address on file"}</p>
          </div>
          <StatusPill value={supplier.status} />
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <article className={glassPanel}>
          <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Supplier profile</h2>
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 text-[13.5px]">
            <Info label="Contact person" value={supplier.contactPerson || "—"} />
            <Info label="Phone" value={supplier.phone || "—"} />
            <Info label="Email" value={supplier.email || "—"} />
            <Info label="Address" value={supplier.address || "—"} />
          </dl>
        </article>
        <aside className={glassPanel}>
          <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Balances</h2>
          <dl className="mt-4 space-y-3">
            <Info label="Total purchases" value={formatTzs(supplierPurchaseTotal(supplier.id, inventory.purchases))} />
            <Info label="Outstanding balance" value={formatTzs(outstanding)} />
            <Info label="Purchase orders" value={String(orders.length)} />
          </dl>
        </aside>
      </section>

      <section className={glassCard}>
        <div className="px-4 pt-4">
          <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Purchase orders</h2>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-4 py-2 font-medium">PO Number</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-[#d5dee8]/80">
                  <td className="px-4 py-3">
                    <Link href={`/supermarket/purchasing/${order.id}`} className="font-semibold text-navy hover:underline">
                      {order.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDisplayDate(order.orderDate)}</td>
                  <td className="px-4 py-3 font-semibold text-navy">{formatTzs(purchaseOrderGrandTotal(order))}</td>
                  <td className="px-4 py-3"><StatusPill value={order.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={glassCard}>
        <div className="px-4 pt-4">
          <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Purchases</h2>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-4 py-2 font-medium">Purchase</th>
                <th className="px-4 py-2 font-medium">PO Number</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Payment</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((item) => (
                <tr key={item.id} className="border-t border-[#d5dee8]/80">
                  <td className="px-4 py-3 font-semibold text-navy">{item.number}</td>
                  <td className="px-4 py-3 text-slate-500">{item.purchaseOrderNumber}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDisplayDate(item.receivedAt)}</td>
                  <td className="px-4 py-3 font-semibold text-navy">{formatTzs(item.totalCost)}</td>
                  <td className="px-4 py-3"><StatusPill value={item.paymentStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-4">
          <h3 className="text-[13px] font-semibold text-navy">Payments</h3>
          <p className="mt-1 text-[13px] text-slate-500">
            {outstanding > 0
              ? `${formatTzs(outstanding)} remains outstanding across unpaid and partial purchases.`
              : "No outstanding supplier balance."}
          </p>
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-navy">{value}</dd>
    </div>
  );
}
