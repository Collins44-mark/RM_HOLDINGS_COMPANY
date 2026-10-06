"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { formatTzs } from "@/lib/format/currency";
import { formatDisplayDate } from "@/lib/data/supermarket-inventory";
import { APP_NAME } from "@/lib/config/app";
import { primaryButton, secondaryButton, tableHead } from "@/components/supermarket/purchasing-ui";
import { getGoodsReceiptDocumentAction, type GoodsReceiptDocumentPayload } from "@/actions/supermarket/purchasing-payables";
import { downloadGoodsReceiptPdf } from "@/lib/supermarket/inventory-store";
import { cn } from "@/lib/cn";

export function GoodsReceiptDocumentModal({
  receiptId,
  onClose,
}: {
  receiptId: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [receipt, setReceipt] = useState<GoodsReceiptDocumentPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client portal mount
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void getGoodsReceiptDocumentAction(receiptId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReceipt(result.document);
    });
    return () => {
      cancelled = true;
    };
  }, [receiptId]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close goods receipt" onClick={onClose} />
      <div className="relative z-[81] max-h-[min(92dvh,92vh)] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,35,64,0.16)] sm:p-6">
        {!receipt && !error ? (
          <p className="py-10 text-center text-[13.5px] text-slate-500">Loading receipt…</p>
        ) : error ? (
          <p className="py-8 text-center text-[13.5px] text-[#c45b66]">{error}</p>
        ) : receipt ? (
          <>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{APP_NAME} · Supermarket</p>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-navy">Goods Receipt</h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-3">
              <Field label="GRN" value={receipt.number} />
              <Field label="Purchase order" value={receipt.poNumber || "—"} />
              <Field label="Supplier" value={receipt.supplierName} />
              <Field label="Received" value={formatDisplayDate(receipt.receivedDate)} />
              <Field label="Received by" value={receipt.receivedBy} />
              <Field label="Status" value={receipt.status} />
            </dl>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">Ordered</th>
                    <th className="px-3 py-2 font-medium">Received</th>
                    <th className="px-3 py-2 font-medium">Unit cost</th>
                    <th className="px-3 py-2 font-medium">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.lines.map((line) => (
                    <tr key={`${line.name}-${line.sku}`} className="border-t border-[#d5dee8]/80">
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-navy">{line.name}</p>
                        {line.sku ? <p className="text-[12px] text-slate-400">{line.sku}</p> : null}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">{line.orderedQty}</td>
                      <td className="px-3 py-2.5 text-navy">{line.receivedQty}</td>
                      <td className="px-3 py-2.5 text-slate-500">{formatTzs(line.unitCost)}</td>
                      <td className="px-3 py-2.5 font-semibold text-navy">{formatTzs(line.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-right text-[14px] font-semibold text-navy">Total received value {formatTzs(receipt.total)}</p>
          </>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Close
          </button>
          {receipt ? (
            <button
              type="button"
              disabled={busy}
              className={cn(primaryButton, "relative min-w-[9.5rem]")}
              onClick={() => {
                if (busy) return;
                setBusy(true);
                void downloadGoodsReceiptPdf(receiptId).then(() => setBusy(false));
              }}
            >
              <span className={cn(busy && "invisible")}>Download PDF</span>
              {busy ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-navy">{value}</dd>
    </div>
  );
}
