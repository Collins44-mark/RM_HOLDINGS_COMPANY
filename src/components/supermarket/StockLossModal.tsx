"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { APP_TIMEZONE } from "@/lib/config/app";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { attachStock, batchExpiryStatus, useSupermarketInventory } from "@/lib/data/supermarket-inventory";
import { STOCK_LOCATIONS, type StockLocation } from "@/lib/data/supermarket-purchasing";
import { canApprovePreparedWork } from "@/lib/supermarket/sod";
import {
  approveStockLossEventAction,
  getStockLossCapsAction,
  listOpenStockLossEventsAction,
  postStockLossEventAction,
  saveStockLossEventAction,
  submitStockLossEventAction,
  type StockLossType,
} from "@/actions/supermarket/stock-loss";
import { refreshMovementsWorkspace, refreshProductsWorkspace } from "@/lib/supermarket/inventory-store";
import { inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";

const REASONS: Record<StockLossType, readonly string[]> = {
  LOSS: ["Missing", "Theft", "Unknown", "Other"],
  DAMAGE: ["Broken", "Water damage", "Handling damage", "Storage damage", "Other"],
  EXPIRED: ["Expired in stock", "Expired before sale", "Other"],
};

function todayIsoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: APP_TIMEZONE,
  }).formatToParts(new Date());
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function StockLossModal({ onClose }: { onClose: () => void }) {
  const inventory = useSupermarketInventory();
  const rows = useMemo(
    () => inventory.products.filter((item) => item.isActive).map((product) => attachStock(product, inventory.batches)),
    [inventory.products, inventory.batches],
  );

  const [caps, setCaps] = useState({
    canCreate: false,
    canApprove: false,
    isOwner: false,
    userId: "",
    sodStockAdjustment: true,
  });
  const [step, setStep] = useState<"form" | "review">("form");
  const [eventId, setEventId] = useState<string | null>(null);
  const [status, setStatus] = useState("DRAFT");
  const [eventType, setEventType] = useState<StockLossType>("LOSS");
  const [productId, setProductId] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [quantity, setQuantity] = useState("");
  const [location, setLocation] = useState<StockLocation>("Main Store");
  const [eventDate, setEventDate] = useState(todayIsoDate);
  const [reason, setReason] = useState<string>(REASONS.LOSS[0]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmed, setConfirmed] = useState<"submitted" | "approved" | "posted" | "">("");
  const [done, setDone] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [openEvents, setOpenEvents] = useState<
    Array<{
      id: string;
      event_number: string;
      event_type: string;
      status: string;
      product_id: string;
      quantity: number;
      reason: string;
      unit_cost: number;
      prepared_by: string | null;
    }>
  >([]);

  useEffect(() => {
    void getStockLossCapsAction().then(setCaps);
    void listOpenStockLossEventsAction().then((result) => {
      if (result.ok) setOpenEvents(result.rows as typeof openEvents);
    });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const eligible = useMemo(() => {
    if (eventType !== "EXPIRED") return rows;
    return rows.filter((row) =>
      inventory.batches.some(
        (batch) =>
          batch.productId === row.id && batch.quantity > 0 && batchExpiryStatus(batch.expiryDate) === "Expired",
      ),
    );
  }, [eventType, rows, inventory.batches]);

  const selected = eligible.find((item) => item.id === productId) ?? null;
  const expiredQty = selected
    ? inventory.batches
        .filter(
          (batch) =>
            batch.productId === selected.id &&
            batch.quantity > 0 &&
            batchExpiryStatus(batch.expiryDate) === "Expired",
        )
        .reduce((sum, batch) => sum + batch.quantity, 0)
    : 0;
  const qty = Number(quantity);
  const valueImpact = selected && Number.isFinite(qty) ? qty * selected.buyingPrice : 0;
  const matches = eligible
    .filter((item) => {
      const needle = productQuery.trim().toLowerCase();
      if (!needle) return true;
      return `${item.name} ${item.sku} ${item.barcode}`.toLowerCase().includes(needle);
    })
    .slice(0, 8);

  function changeType(next: StockLossType) {
    setEventType(next);
    setReason(REASONS[next][0]);
    setProductId("");
    setProductQuery("");
    setError("");
  }

  async function persist() {
    const result = await saveStockLossEventAction({
      eventId: eventId ?? undefined,
      eventType,
      productId,
      quantity: qty,
      location,
      eventDate,
      reason,
      notes,
    });
    if (!result.ok) return { id: null as string | null, error: result.error };
    setEventId(result.id);
    return { id: result.id, error: null as string | null };
  }

  if (done) {
    return (
      <Overlay onClose={onClose}>
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Inventory Adjustment</h2>
        <p className="mt-3 text-[13.5px] text-slate-500">{done}</p>
        <div className="mt-5 flex justify-end">
          <button type="button" className={primaryButton} onClick={onClose}>
            Done
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Inventory Adjustment</h2>
      <p className="mt-1 text-[13px] text-slate-500">
        Record loss, damage or expired stock. Stock does not change until the event is approved and posted.
      </p>

      {openEvents.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-slate-400">Open events</p>
          {openEvents.map((item) => {
            const productName = inventory.products.find((product) => product.id === item.product_id)?.name ?? "Product";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setEventId(item.id);
                  setStatus(item.status);
                  setEventType(item.event_type as StockLossType);
                  setProductId(item.product_id);
                  setProductQuery(productName);
                  setQuantity(String(item.quantity));
                  setReason(item.reason);
                  setPreparedBy(item.prepared_by ?? "");
                  setStep("review");
                }}
                className="flex w-full items-center justify-between rounded-[14px] border border-white/80 bg-white/70 px-3 py-2 text-left"
              >
                <span className="text-[13px] font-medium text-navy">
                  {item.event_number} · {productName} · {item.quantity}
                </span>
                <span className="text-[12px] text-slate-500">{item.status}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {step === "form" ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(["LOSS", "DAMAGE", "EXPIRED"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => changeType(type)}
                className={cn(
                  "h-10 rounded-[14px] border text-[13px] font-semibold transition",
                  eventType === type
                    ? "border-[#0b2244] bg-[#0b2244] text-white"
                    : "border-[#dbe4ef] bg-white text-navy hover:bg-[#f7f9fc]",
                )}
              >
                {type === "LOSS" ? "Loss" : type === "DAMAGE" ? "Damage" : "Expired"}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Product</span>
            <input
              value={productQuery || selected?.name || ""}
              onChange={(event) => {
                setProductQuery(event.target.value);
                setProductId("");
              }}
              placeholder={eventType === "EXPIRED" ? "Search expired products" : "Search products"}
              className={inputClass}
            />
            {eligible.length === 0 ? (
              <p className="mt-2 text-[13px] text-slate-500">
                {eventType === "EXPIRED" ? "No expired products available." : "No products available."}
              </p>
            ) : (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-[14px] border border-white/80 bg-white/95">
                {matches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setProductId(item.id);
                      setProductQuery(item.name);
                    }}
                    className="flex w-full flex-col px-3.5 py-2 text-left hover:bg-[#f5f8fc]"
                  >
                    <span className="text-[13px] font-semibold text-navy">{item.name}</span>
                    <span className="text-[12px] text-slate-400">
                      Stock {item.stock} · {formatTzs(item.buyingPrice)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </label>

          {selected ? (
            <p className="text-[12.5px] text-slate-500">
              System stock {selected.stock}
              {eventType === "EXPIRED" ? ` · Expired units ${expiredQty}` : ""} · Unit cost {formatTzs(selected.buyingPrice)}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Quantity</span>
              <input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Date</span>
              <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} className={inputClass} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Location</span>
              <select value={location} onChange={(event) => setLocation(event.target.value as StockLocation)} className={inputClass}>
                {STOCK_LOCATIONS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Reason</span>
              <select value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass}>
                {REASONS[eventType].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className={cn(inputClass, "h-auto py-3")} />
          </label>
        </div>
      ) : (
        <dl className="mt-4 space-y-2 text-[13.5px]">
          <ReviewRow label="Product" value={selected?.name ?? "—"} />
          <ReviewRow label="Type" value={eventType === "LOSS" ? "Loss" : eventType === "DAMAGE" ? "Damage" : "Expired"} />
          <ReviewRow label="Quantity" value={`${qty} units`} />
          <ReviewRow label="Reason" value={reason} />
          <ReviewRow label="Unit cost" value={formatTzs(selected?.buyingPrice ?? 0)} />
          <ReviewRow label="Value impact" value={formatTzs(valueImpact)} />
          <ReviewRow label="Status" value={status} />
        </dl>
      )}

      {error ? <p className="mt-3 text-[13px] text-[#c45b66]">{error}</p> : null}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={secondaryButton} onClick={onClose}>
          Cancel
        </button>
        {step === "form" ? (
          <>
            {caps.canCreate ? (
              <button
                type="button"
                disabled={Boolean(busy)}
                className={secondaryButton}
                onClick={async () => {
                  setBusy("draft");
                  setError("");
                  const saved = await persist();
                  setBusy("");
                  if (!saved.id) return setError(saved.error ?? "Unable to save.");
                  setDone("Draft saved. Stock was not changed.");
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  {busy === "draft" ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : null}
                  Save Draft
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                if (!selected) return setError("Select a product.");
                if (!Number.isInteger(qty) || qty <= 0) return setError("Enter a quantity greater than zero.");
                if (!reason.trim()) return setError("A reason is required.");
                setError("");
                setStep("review");
              }}
            >
              Review
            </button>
          </>
        ) : (
          <>
            <button type="button" className={secondaryButton} onClick={() => setStep("form")}>
              Back
            </button>
            {caps.canCreate && (status === "DRAFT" || confirmed === "submitted") ? (
              <button
                type="button"
                disabled={Boolean(busy) || confirmed === "submitted"}
                className={cn(primaryButton, "min-w-[7.75rem]")}
                onClick={async () => {
                  setBusy("submit");
                  setError("");
                  const submitted = await submitStockLossEventAction({
                    eventId: eventId ?? undefined,
                    eventType,
                    productId,
                    quantity: qty,
                    location,
                    eventDate,
                    reason,
                    notes,
                  });
                  setBusy("");
                  if (!submitted.ok) return setError(submitted.error);
                  setEventId(submitted.id);
                  setStatus("SUBMITTED");
                  setPreparedBy(caps.userId);
                  setConfirmed("submitted");
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  {busy === "submit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : null}
                  {confirmed === "submitted" ? "Submitted ✓" : "Submit"}
                </span>
              </button>
            ) : null}
            {canApprovePreparedWork({
              canApprove: caps.canApprove && status === "SUBMITTED",
              isOwner: caps.isOwner,
              sodEnabled: caps.sodStockAdjustment,
              preparerId: preparedBy,
              userId: caps.userId,
            }) ? (
              <button
                type="button"
                disabled={Boolean(busy) || !eventId || confirmed === "approved"}
                className={cn(primaryButton, "min-w-[7.75rem]")}
                onClick={async () => {
                  if (!eventId) return;
                  setBusy("approve");
                  setError("");
                  const result = await approveStockLossEventAction(eventId);
                  setBusy("");
                  if (!result.ok) return setError(result.error);
                  setStatus("APPROVED");
                  setConfirmed("approved");
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  {busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : null}
                  {confirmed === "approved" ? "Approved ✓" : "Approve"}
                </span>
              </button>
            ) : null}
            {canApprovePreparedWork({
              canApprove: caps.canApprove && (status === "APPROVED" || confirmed === "posted"),
              isOwner: caps.isOwner,
              sodEnabled: caps.sodStockAdjustment,
              preparerId: preparedBy,
              userId: caps.userId,
            }) ? (
              <button
                type="button"
                disabled={Boolean(busy) || !eventId || confirmed === "posted"}
                className={cn(primaryButton, "min-w-[7.75rem]")}
                onClick={async () => {
                  if (!eventId) return;
                  setBusy("post");
                  setError("");
                  const posted = await postStockLossEventAction(eventId);
                  if (!posted.ok) {
                    setBusy("");
                    setError(posted.error);
                    return;
                  }
                  setBusy("");
                  setStatus("POSTED");
                  setConfirmed("posted");
                  void refreshProductsWorkspace();
                  void refreshMovementsWorkspace();
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  {busy === "post" ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : null}
                  {confirmed === "posted" ? "Posted ✓" : "Post"}
                </span>
              </button>
            ) : null}
          </>
        )}
      </div>
    </Overlay>
  );
}

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close inventory adjustment" onClick={onClose} />
      <div className="relative z-[81] max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-[24px] border border-white/80 bg-white/95 p-5 shadow-[0_24px_60px_rgba(15,35,64,0.16)]">
        {children}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-navy">{value}</dd>
    </div>
  );
}
