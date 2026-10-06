"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { getPurchaseOrderByIdAction } from "@/actions/supermarket/catalog";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { cachePurchaseOrder, formatDisplayDate, receivePurchaseOrder } from "@/lib/data/supermarket-inventory";
import { getInventorySnapshot } from "@/lib/supermarket/inventory-store";
import {
  purchaseLineRemaining,
  type PurchaseOrder,
  type ReceivePurchaseLineInput,
} from "@/lib/data/supermarket-purchasing";
import { glassPanel, inputClass, primaryButton, PulseBar, secondaryButton } from "@/components/supermarket/purchasing-ui";
import { PageBackButton } from "@/components/ui/PageBackButton";

type LineState = {
  productId: string;
  received: string;
  destination: "Main Store" | "Sales Floor" | "Split";
  mainStore: string;
  salesFloor: string;
};

type LoadPhase = "loading" | "found" | "not_found" | "error" | "unauthorized";

function emptyLines(order: PurchaseOrder): LineState[] {
  return order.lines
    .filter((line) => purchaseLineRemaining(line) > 0)
    .map((line) => ({
      productId: line.productId,
      received: "",
      destination: "Main Store" as const,
      mainStore: "",
      salesFloor: "",
    }));
}

export function ReceivePurchaseShell({
  subtitle,
}: {
  subtitle?: string;
}) {
  return (
    <div className="min-w-0 space-y-5 pb-10">
      <div>
        <PageBackButton href="/supermarket/purchasing" prefetch />
        <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">Receive Purchase</h1>
        {subtitle ? (
          <p className="mt-1.5 text-[13px] text-slate-500">{subtitle}</p>
        ) : (
          <p className="mt-1.5">
            <PulseBar className="h-3.5 w-64" />
          </p>
        )}
      </div>
      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Received quantities</h2>
        <p className="mt-2">
          <PulseBar className="h-3.5 w-72" />
        </p>
        <div className="mt-5 space-y-4">
          {[0, 1].map((key) => (
            <div key={key} className="rounded-[18px] border border-white/80 bg-white/65 p-4">
              <PulseBar className="h-4 w-36" />
              <p className="mt-2">
                <PulseBar className="h-3 w-56" />
              </p>
              <div className="mt-4 h-12 rounded-[14px] bg-slate-100/80" />
            </div>
          ))}
        </div>
      </section>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <span className={cn(secondaryButton, "pointer-events-none opacity-60")}>Cancel</span>
        <span className={cn(primaryButton, "pointer-events-none min-w-[9.5rem] opacity-60")}>Post Receipt</span>
      </div>
    </div>
  );
}

export function ReceivePurchasePage() {
  const params = useParams<{ poId: string }>();
  const poId = Array.isArray(params.poId) ? params.poId[0] : params.poId;
  const { user } = useAuth();
  const cachedOrder = poId
    ? getInventorySnapshot().purchaseOrders.find((item) => item.id === poId) ?? null
    : null;
  const requestId = useRef("");
  const postingLock = useRef(false);
  const [phase, setPhase] = useState<LoadPhase>(!poId ? "not_found" : cachedOrder ? "found" : "loading");
  const [order, setOrder] = useState<PurchaseOrder | null>(cachedOrder);
  const [loadError, setLoadError] = useState("");
  const [success, setSuccess] = useState<{
    number: string;
    status: string;
    lines: { name: string; quantity: number; mainStore: number; salesFloor: number }[];
  } | null>(null);
  const [formError, setFormError] = useState("");
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [posting, setPosting] = useState(false);
  const [lines, setLines] = useState<LineState[]>(() => (cachedOrder ? emptyLines(cachedOrder) : []));
  const seededFor = useRef<string | null>(cachedOrder?.id ?? null);

  useEffect(() => {
    if (!poId) return;
    let cancelled = false;
    void getPurchaseOrderByIdAction(poId).then((result) => {
      if (cancelled) return;
      if (result.status === "found") {
        cachePurchaseOrder(result.order);
        setOrder(result.order);
        setPhase("found");
        if (seededFor.current !== result.order.id) {
          seededFor.current = result.order.id;
          setLines(emptyLines(result.order));
        }
        return;
      }
      if (result.status === "not_found") {
        setOrder(null);
        setPhase("not_found");
        return;
      }
      setOrder((current) => (current?.id === poId ? current : null));
      setPhase((current) => {
        if (current === "found") return current;
        if (result.status === "unauthorized") return "unauthorized";
        return "error";
      });
      setLoadError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [poId]);

  const totals = useMemo(() => {
    if (!order) return { ordered: 0, received: 0, remaining: 0 };
    return {
      ordered: order.lines.reduce((sum, line) => sum + line.quantityOrdered, 0),
      received: order.lines.reduce((sum, line) => sum + line.quantityReceived, 0),
      remaining: order.lines.reduce((sum, line) => sum + purchaseLineRemaining(line), 0),
    };
  }, [order]);

  function patchLine(productId: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.productId === productId ? { ...line, ...patch } : line)));
  }

  async function confirm() {
    if (!order || postingLock.current) return;
    const current = order;
    const nextErrors: Record<string, string> = {};
    const payload: ReceivePurchaseLineInput[] = [];
    for (const line of lines) {
      const ordered = current.lines.find((item) => item.productId === line.productId);
      if (!ordered) continue;
      const remaining = purchaseLineRemaining(ordered);
      const received = Number(line.received);
      if (!line.received.trim()) continue;
      if (!Number.isInteger(received) || received <= 0) {
        nextErrors[line.productId] = "Enter a received quantity greater than zero.";
        continue;
      }
      if (received > remaining) {
        nextErrors[line.productId] = `Only ${remaining} units remaining.`;
        continue;
      }
      let mainStore = received;
      let salesFloor = 0;
      if (line.destination === "Sales Floor") {
        mainStore = 0;
        salesFloor = received;
      } else if (line.destination === "Split") {
        mainStore = Number(line.mainStore);
        salesFloor = Number(line.salesFloor);
        if (!Number.isInteger(mainStore) || !Number.isInteger(salesFloor) || mainStore < 0 || salesFloor < 0) {
          nextErrors[line.productId] = "Enter Main Store and Sales Floor quantities.";
          continue;
        }
        if (mainStore + salesFloor !== received) {
          nextErrors[line.productId] = "Stock allocation must equal the received quantity.";
          continue;
        }
      }
      payload.push({ productId: line.productId, quantity: received, mainStore, salesFloor });
    }

    if (Object.keys(nextErrors).length) {
      setLineErrors(nextErrors);
      setFormError("");
      return;
    }
    if (!payload.length) {
      setFormError("Enter a received quantity for at least one product.");
      return;
    }

    postingLock.current = true;
    setPosting(true);
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const result = await receivePurchaseOrder({
      purchaseOrderId: current.id,
      lines: payload,
      user: user?.name || "Storekeeper",
      requestId: requestId.current,
    });
    postingLock.current = false;
    setPosting(false);
    if (result.error || !result.purchase) {
      setFormError(result.error || "Unable to confirm receipt.");
      return;
    }
    setLineErrors({});
    setFormError("");
    setSuccess({
      number: result.purchase.number,
      status: result.orderStatus || current.status,
      lines: result.purchase.lines.map((line) => ({
        name: line.productName,
        quantity: line.quantity,
        mainStore: line.mainStore,
        salesFloor: line.salesFloor,
      })),
    });
  }

  if (phase === "loading") {
    return <ReceivePurchaseShell />;
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

  if (phase === "error" || !order) {
    return (
      <div className="min-w-0 pb-10">
        <PageBackButton href="/supermarket/purchasing" prefetch />
        <h1 className="mt-4 text-[24px] font-semibold text-navy">We couldn&apos;t load this purchase order. Please try again.</h1>
        {loadError ? <p className="mt-2 text-[13px] text-slate-500">{loadError}</p> : null}
      </div>
    );
  }

  if (order.status !== "Sent" && order.status !== "Partially Received" && !success) {
    return (
      <div className="min-w-0 pb-10">
        <PageBackButton href={`/supermarket/purchasing/${order.id}`} prefetch />
        <h1 className="mt-4 text-[24px] font-semibold text-navy">This order is not open for receiving.</h1>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-w-0 pb-10">
        <div className={cn(glassPanel, "mx-auto max-w-xl text-center")}>
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#e7f4ea] text-[#3f8a5a]">
            <Check className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.04em] text-navy">Posted ✓</h1>
          <p className="mt-2 text-[13.5px] text-slate-500">
            {success.number} updated {order.number} to {success.status}. Stock and stock movements were updated automatically.
          </p>
          <div className="mt-5 space-y-2 text-left">
            {success.lines.map((line) => (
              <div key={line.name} className="rounded-[16px] border border-white/80 bg-white/70 px-4 py-3">
                <p className="font-semibold text-navy">{line.name}</p>
                <p className="mt-1 text-[13px] text-slate-500">
                  +{line.quantity} · Main Store {line.mainStore} · Sales Floor {line.salesFloor}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href={`/supermarket/purchasing/${order.id}`} className={secondaryButton}>
              View purchase order
            </Link>
            <Link href="/supermarket/stock" className={primaryButton}>
              View stock
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <div>
        <PageBackButton href={`/supermarket/purchasing/${order.id}`} prefetch />
        <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">Receive Purchase</h1>
        <p className="mt-1.5 text-[13px] text-slate-500">
          {order.number} · {order.supplierName} · Ordered {formatDisplayDate(order.orderDate)}
        </p>
      </div>

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Received quantities</h2>
        <p className="mt-2 text-[13px] text-slate-500">
          Total ordered {totals.ordered} · Total received {totals.received} · Remaining {totals.remaining}
        </p>
        <div className="mt-5 space-y-4">
          {order.lines.map((line) => {
            const remaining = purchaseLineRemaining(line);
            const state = lines.find((item) => item.productId === line.productId);
            if (!state || remaining <= 0) {
              return (
                <div key={line.id} className="rounded-[16px] border border-white/80 bg-white/50 px-4 py-3 text-[13px] text-slate-500">
                  {line.productName} is fully received.
                </div>
              );
            }
            return (
              <article key={line.id} className="rounded-[18px] border border-white/80 bg-white/65 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[15px] font-semibold text-navy">{line.productName}</h3>
                    <p className="mt-1 text-[12.5px] text-slate-500">
                      Ordered {line.quantityOrdered} · Previously received {line.quantityReceived} · Remaining {remaining} · {formatTzs(line.buyingPrice)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label>
                    <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Receive now</span>
                    <input
                      inputMode="numeric"
                      value={state.received}
                      onChange={(event) => patchLine(line.productId, { received: event.target.value })}
                      className={inputClass}
                      placeholder="0"
                    />
                  </label>
                  <label className="md:col-span-2">
                    <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Stock destination</span>
                    <div className="grid grid-cols-3 gap-2">
                      {(["Main Store", "Sales Floor", "Split"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => patchLine(line.productId, { destination: option })}
                          className={cn(
                            "h-12 rounded-[14px] border text-[13px] font-semibold transition",
                            state.destination === option
                              ? "border-[#0b2244] bg-[#0b2244] text-white"
                              : "border-[#dbe4ef] bg-white text-navy hover:bg-[#f7f9fc]",
                          )}
                        >
                          {option === "Split" ? "Split Stock" : option}
                        </button>
                      ))}
                    </div>
                  </label>
                </div>
                {state.destination === "Split" ? (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label>
                      <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Main Store</span>
                      <input inputMode="numeric" value={state.mainStore} onChange={(event) => patchLine(line.productId, { mainStore: event.target.value })} className={inputClass} />
                    </label>
                    <label>
                      <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Sales Floor</span>
                      <input inputMode="numeric" value={state.salesFloor} onChange={(event) => patchLine(line.productId, { salesFloor: event.target.value })} className={inputClass} />
                    </label>
                  </div>
                ) : null}
                {lineErrors[line.productId] ? <p className="mt-2 text-[12.5px] text-[#c45b66]">{lineErrors[line.productId]}</p> : null}
              </article>
            );
          })}
        </div>
        {formError ? <p className="mt-4 text-[13px] text-[#c45b66]">{formError}</p> : null}
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={`/supermarket/purchasing/${order.id}`} className={secondaryButton}>
          Cancel
        </Link>
        <button type="button" disabled={posting} onClick={() => void confirm()} className={cn(primaryButton, "relative min-w-[9.5rem]")}>
          <span className={cn("inline-flex items-center justify-center", posting && "invisible")}>Post Receipt</span>
          {posting ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
