"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getPurchaseOrderWorkspaceAction } from "@/actions/supermarket/catalog";

import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { cachePurchaseOrder, formatDisplayDate, useSupermarketInventory } from "@/lib/data/supermarket-inventory";
import { applyPurchaseOrderWorkspace } from "@/lib/supermarket/inventory-store";
import {
  purchaseLineRemaining,
  purchaseOrderGrandTotal,
  purchaseOrderSubtotal,
  type PurchaseOrder,
} from "@/lib/data/supermarket-purchasing";
import { StatusPill, glassPanel, primaryButton, PulseBar, tableHead } from "@/components/supermarket/purchasing-ui";
import { PurchaseOrderWorkflow } from "@/components/supermarket/PurchaseOrderPayables";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import { GoodsReceiptDocumentModal } from "@/components/supermarket/GoodsReceiptDocumentModal";
import { downloadGoodsReceiptPdf } from "@/lib/supermarket/inventory-store";

type LoadPhase = "loading" | "found" | "not_found" | "error" | "unauthorized";

export function PurchaseOrderDetailPage() {
  const params = useParams<{ poId: string }>();
  const poId = Array.isArray(params.poId) ? params.poId[0] : params.poId;
  const inventory = useSupermarketInventory({ purchasing: true });
  const snapshotOrder = inventory.purchaseOrders.find((item) => item.id === poId);
  const [phase, setPhase] = useState<LoadPhase>(() => {
    if (!poId) return "not_found";
    return snapshotOrder ? "found" : "loading";
  });
  const [targeted, setTargeted] = useState<PurchaseOrder | null>(snapshotOrder ?? null);
  const [loadError, setLoadError] = useState("");
  const [receiptViewId, setReceiptViewId] = useState<string | null>(null);

  useEffect(() => {
    if (!poId) return;
    let cancelled = false;
    void getPurchaseOrderWorkspaceAction(poId).then((result) => {
      if (cancelled) return;
      if (result.status === "found") {
        applyPurchaseOrderWorkspace(result.workspace);
        cachePurchaseOrder(result.workspace.order);
        setTargeted(result.workspace.order);
        setPhase("found");
        return;
      }
      setTargeted((existing) => (existing?.id === poId ? existing : null));
      if (result.status === "not_found") setPhase("not_found");
      else if (result.status === "unauthorized") {
        setPhase("unauthorized");
        setLoadError(result.error);
      } else {
        setPhase("error");
        setLoadError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [poId]);

  const order = targeted ?? snapshotOrder ?? null;

  if (phase === "loading" && !order) {
    return (
      <div className="min-w-0 space-y-5 pb-10">
        <div>
          <PageBackButton href="/supermarket/purchasing" prefetch />
          <h1 className="mt-4">
            <PulseBar className="h-8 w-40" />
          </h1>
          <p className="mt-1.5">
            <PulseBar className="h-3.5 w-56" />
          </p>
        </div>
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Order lines</h2>
          <div className="mt-4 space-y-3">
            <PulseBar className="h-10 w-full" />
            <PulseBar className="h-10 w-full" />
          </div>
        </section>
      </div>
    );
  }

  if (phase === "not_found") {
    return (
      <div className="min-w-0 pb-10">
        <PageBackButton href="/supermarket/purchasing" prefetch />
        <h1 className="mt-4 text-[24px] font-semibold text-navy">Purchase order not found.</h1>
      </div>
    );
  }

  if (phase === "unauthorized") {
    return (
      <div className="min-w-0 pb-10">
        <PageBackButton href="/supermarket/purchasing" prefetch />
        <h1 className="mt-4 text-[24px] font-semibold text-navy">You don&apos;t have access to this purchase order.</h1>
        {loadError ? <p className="mt-2 text-[13px] text-slate-500">{loadError}</p> : null}
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-w-0 pb-10">
        <PageBackButton href="/supermarket/purchasing" prefetch />
        <h1 className="mt-4 text-[24px] font-semibold text-navy">We couldn&apos;t load this purchase order. Please try again.</h1>
        {loadError ? <p className="mt-2 text-[13px] text-slate-500">{loadError}</p> : null}
      </div>
    );
  }

  const purchases = inventory.purchases.filter((item) => item.purchaseOrderId === order.id);
  const receipts = [...new Map(purchases.flatMap((item) => item.receipts).map((item) => [item.id, item])).values()];
  const invoices = inventory.supplierInvoices.filter((item) => item.purchaseOrderId === order.id);
  const requests = inventory.paymentRequests.filter((item) =>
    invoices.some((invoice) => invoice.id === item.invoiceId),
  );
  const canReceive = order.status === "Sent" || order.status === "Partially Received";
  const orderedQty = order.lines.reduce((sum, line) => sum + line.quantityOrdered, 0);
  const receivedQty = order.lines.reduce((sum, line) => sum + line.quantityReceived, 0);
  const remainingQty = order.lines.reduce((sum, line) => sum + purchaseLineRemaining(line), 0);
  const receivedValue = order.lines.reduce((sum, line) => sum + line.quantityReceived * line.buyingPrice, 0);
  const verifiedInvoice = invoices.find((item) => item.verificationStatus === "Verified") ?? null;

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <PageBackButton href="/supermarket/purchasing" prefetch />
          <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">{order.number}</h1>
          <p className="mt-1.5 text-[13px] text-slate-500">{order.supplierName} · Ordered {formatDisplayDate(order.orderDate)}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <StatusPill value={order.status} />
          {canReceive ? (
            <Link href={`/supermarket/purchasing/${order.id}/receive`} className={primaryButton}>
              Receive Goods
            </Link>
          ) : null}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Ordered" value={String(orderedQty)} />
        <SummaryCard label="Received" value={String(receivedQty)} />
        <SummaryCard label="Remaining" value={String(remainingQty)} />
        <SummaryCard label="Received value" value={formatTzs(receivedValue)} />
      </section>

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
            <Row label="Status" value={order.status} />
            <Row label="Order date" value={formatDisplayDate(order.orderDate)} />
            <Row label="Expected" value={formatDisplayDate(order.expectedDate)} />
            <Row label="Subtotal" value={formatTzs(purchaseOrderSubtotal(order))} />
            <Row label="Discount" value={formatTzs(order.discount)} />
            <Row label="Tax" value={formatTzs(order.tax)} />
            <Row label="Grand total" value={formatTzs(purchaseOrderGrandTotal(order))} strong />
            <Row label="Owed" value={verifiedInvoice ? formatTzs(verifiedInvoice.outstanding) : "Awaiting supplier invoice"} strong />
            <Row label="Paid" value={verifiedInvoice ? formatTzs(verifiedInvoice.amountPaid) : formatTzs(0)} />
          </dl>
          {order.notes ? <p className="mt-4 text-[13px] leading-5 text-slate-500">{order.notes}</p> : null}
        </aside>
      </section>

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Goods receipts</h2>
        <p className="mt-1 text-[13px] text-slate-500">Warehouse receipts for this purchase order. Separate from the RM Holdings purchase document.</p>
        {receipts.length === 0 ? (
          <p className="mt-3 text-[13px] text-slate-500">No goods receipts yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-[#d5dee8]/70">
            {receipts.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-navy">{item.number}</p>
                  <p className="text-[12.5px] text-slate-500">
                    {formatDisplayDate(item.receivedAt)} · {order.supplierName} · {order.number}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-slate-500">
                    {item.itemCount} items · {formatTzs(item.totalCost)}
                  </p>
                </div>
                <CompactActionsMenu
                  ariaLabel={`Actions for ${item.number}`}
                  items={[
                    { label: "View Receipt", onSelect: () => setReceiptViewId(item.id) },
                    { label: "Download PDF", onSelect: () => void downloadGoodsReceiptPdf(item.id) },
                  ]}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <PurchaseOrderWorkflow order={order} purchases={purchases} invoices={invoices} requests={requests} />
      {receiptViewId ? <GoodsReceiptDocumentModal receiptId={receiptViewId} onClose={() => setReceiptViewId(null)} /> : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className={glassPanel}>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-1.5 text-[20px] font-semibold tracking-[-0.04em] text-navy">{value}</p>
    </article>
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
