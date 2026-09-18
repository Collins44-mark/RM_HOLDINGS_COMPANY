"use client";

import Link from "next/link";

import { formatTzs } from "@/lib/format/currency";
import { formatDisplayDate, useSupermarketInventory } from "@/lib/data/supermarket-inventory";
import { purchaseOrderGrandTotal, purchaseOrderItemCount, receivablePurchaseOrders } from "@/lib/data/supermarket-purchasing";
import { StatusPill, glassCard, primaryButton, tableHead } from "@/components/supermarket/purchasing-ui";
import { PageBackButton } from "@/components/ui/PageBackButton";

export function ReceivePurchasePickerPage() {
  const inventory = useSupermarketInventory();
  const orders = receivablePurchaseOrders(inventory.purchaseOrders);

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <div>
        <PageBackButton href="/supermarket/stock" prefetch />
        <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">Receive Purchase</h1>
        <p className="mt-1.5 text-[13px] text-slate-500">Open a sent or partially received purchase order to receive goods into stock.</p>
      </div>
      <section className={glassCard}>
        {orders.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[14px] font-medium text-navy">No open purchase orders</p>
            <p className="mt-1 text-[13px] text-slate-500">Create or send a purchase order before receiving stock.</p>
            <Link href="/supermarket/purchasing/new" className={`${primaryButton} mt-4`}>
              New Purchase Order
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className={tableHead}>
                <tr>
                  <th className="px-4 py-3 font-medium">PO Number</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Expected</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-t border-[#d5dee8]/80">
                    <td className="px-4 py-3 font-semibold text-navy">{order.number}</td>
                    <td className="px-4 py-3 text-slate-500">{order.supplierName}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDisplayDate(order.expectedDate)}</td>
                    <td className="px-4 py-3 text-slate-500">{purchaseOrderItemCount(order)}</td>
                    <td className="px-4 py-3 font-semibold text-navy">{formatTzs(purchaseOrderGrandTotal(order))}</td>
                    <td className="px-4 py-3"><StatusPill value={order.status} /></td>
                    <td className="px-4 py-3">
                      <Link href={`/supermarket/purchasing/${order.id}/receive`} className="text-[13px] font-semibold text-navy hover:underline">
                        Receive Goods
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
