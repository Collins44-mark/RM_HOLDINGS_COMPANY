"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { formatDisplayDate, useSupermarketInventory } from "@/lib/data/supermarket-inventory";
import { purchaseLineRemaining, purchaseOrderGrandTotal, purchaseOrderSubtotal } from "@/lib/data/supermarket-purchasing";
import { StatusPill, glassPanel, primaryButton, secondaryButton, tableHead } from "@/components/supermarket/purchasing-ui";

export function PurchaseOrderDetailPage() {
  const params = useParams<{ poId: string }>();
  const inventory = useSupermarketInventory();
  const order = inventory.purchaseOrders.find((item) => item.id === params.poId);
  if (!order) {
    return (
      <div className="min-w-0 pb-10">
        <Link href="/supermarket/purchasing" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500">
          Back to Purchasing
        </Link>
        <h1 className="mt-4 text-[24px] font-semibold text-navy">Purchase order not found.</h1>
      </div>
    );
  }

  const purchases = inventory.purchases.filter((item) => item.purchaseOrderId === order.id);
  const canReceive = order.status === "Sent" || order.status === "Partially Received";
  const canSend = order.status === "Draft";

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/supermarket/purchasing" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500 transition hover:text-navy">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.9} />
            Back to Purchasing
          </Link>
          <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">{order.number}</h1>
          <p className="mt-1.5 text-[13px] text-slate-500">{order.supplierName} · Ordered {formatDisplayDate(order.orderDate)}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {canSend ? (
            <button type="button" onClick={() => inventory.sendPurchaseOrder(order.id)} className={secondaryButton}>
              Send Order
            </button>
          ) : null}
          {canReceive ? (
            <Link href={`/supermarket/purchasing/${order.id}/receive`} className={primaryButton}>
              Receive Goods
            </Link>
          ) : null}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <article className={glassPanel}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Order lines</h2>
            <StatusPill value={order.status} />
          </div>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-[13px]">
              <thead className={tableHead}>
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Ordered</th>
                  <th className="px-3 py-2 font-medium">Received</th>
                  <th className="px-3 py-2 font-medium">Remaining</th>
                  <th className="px-3 py-2 font-medium">Buying Price</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => (
                  <tr key={line.id} className="border-t border-[#d5dee8]/80">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-navy">{line.productName}</p>
                      <p className="text-[12px] text-slate-400">{line.sku}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{line.quantityOrdered}</td>
                    <td className="px-3 py-3 text-slate-500">{line.quantityReceived}</td>
                    <td className="px-3 py-3 font-semibold text-navy">{purchaseLineRemaining(line)}</td>
                    <td className="px-3 py-3 text-slate-500">{formatTzs(line.buyingPrice)}</td>
                    <td className="px-3 py-3 font-semibold text-navy">{formatTzs(line.quantityOrdered * line.buyingPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-3 md:hidden">
            {order.lines.map((line) => (
              <div key={line.id} className="rounded-[16px] border border-white/80 bg-white/60 px-3.5 py-3">
                <p className="font-semibold text-navy">{line.productName}</p>
                <p className="mt-2 text-[13px] text-slate-500">
                  Ordered {line.quantityOrdered} · Received {line.quantityReceived} · Remaining {purchaseLineRemaining(line)}
                </p>
              </div>
            ))}
          </div>
        </article>
        <aside className={cn(glassPanel, "h-fit")}>
          <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Summary</h2>
          <dl className="mt-4 space-y-2.5 text-[13.5px]">
            <Row label="Supplier" value={order.supplierName} />
            <Row label="Order date" value={formatDisplayDate(order.orderDate)} />
            <Row label="Expected" value={formatDisplayDate(order.expectedDate)} />
            <Row label="Subtotal" value={formatTzs(purchaseOrderSubtotal(order))} />
            <Row label="Discount" value={formatTzs(order.discount)} />
            <Row label="Tax" value={formatTzs(order.tax)} />
            <Row label="Grand total" value={formatTzs(purchaseOrderGrandTotal(order))} strong />
          </dl>
          {order.notes ? <p className="mt-4 text-[13px] leading-5 text-slate-500">{order.notes}</p> : null}
        </aside>
      </section>

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Receipts</h2>
        {purchases.length === 0 ? (
          <p className="mt-3 text-[13px] text-slate-500">No goods have been received against this order yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-[#d5dee8]/70">
            {purchases.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-[13.5px] font-semibold text-navy">{item.number}</p>
                  <p className="text-[12.5px] text-slate-500">{formatDisplayDate(item.receivedAt)} · {item.itemCount} items</p>
                </div>
                <p className="text-[13.5px] font-semibold text-navy">{formatTzs(item.totalCost)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={strong ? "font-semibold text-navy" : "text-navy"}>{value}</dd>
    </div>
  );
}
