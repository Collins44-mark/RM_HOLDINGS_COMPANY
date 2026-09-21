"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Search } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/cn";
import { attachStock, useSupermarketInventory, type ProductStockRow } from "@/lib/data/supermarket-inventory";
import { STOCK_ADJUSTMENT_KINDS, type StockAdjustmentKind } from "@/lib/data/supermarket-inventory";
import { STOCK_LOCATIONS, type StockLocation } from "@/lib/data/supermarket-purchasing";
import { glassPanel, inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import { PageBackButton } from "@/components/ui/PageBackButton";

const REASONS = ["Physical count correction", "Damaged", "Lost", "Expired", "Other approved adjustment"] as const;
const PRODUCT_PAGE_SIZE = 10;

export function StockAdjustmentPage() {
  const { user } = useAuth();
  const inventory = useSupermarketInventory();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kind, setKind] = useState<StockAdjustmentKind>("Correction");
  const [direction, setDirection] = useState<"increase" | "decrease">("decrease");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [location, setLocation] = useState<StockLocation>("Main Store");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ name: string; quantity: number } | null>(null);

  const rows = useMemo(
    () => inventory.products.map((product) => attachStock(product, inventory.batches)),
    [inventory.products, inventory.batches],
  );
  const selected = rows.find((item) => item.id === selectedId) ?? null;

  async function confirm() {
    const qty = Number(quantity);
    if (!selected) return setError("Select a product.");
    if (!Number.isInteger(qty) || qty <= 0) return setError("Enter a quantity greater than zero.");
    if (!reason.trim()) return setError("A reason is required.");
    const result = await inventory.adjustStock({
      productId: selected.id,
      kind: kind === "Correction" ? "Correction" : kind,
      quantity: qty,
      correctionDirection: kind === "Correction" ? direction : undefined,
      reason,
      location,
      user: user?.name || "Storekeeper",
    });
    if (result.error) return setError(result.error);
    setSuccess({ name: selected.name, quantity: kind === "Increase" || (kind === "Correction" && direction === "increase") ? qty : -qty });
  }

  if (success) {
    return (
      <div className={cn(glassPanel, "mx-auto max-w-xl text-center")}>
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#e7f4ea] text-[#3f8a5a]">
          <Check className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-[24px] font-semibold text-navy">Stock adjusted</h1>
        <p className="mt-2 text-[13.5px] text-slate-500">
          {success.name} · {success.quantity > 0 ? `+${success.quantity}` : success.quantity} · {reason}
        </p>
        <Link href="/supermarket/stock" className={cn(primaryButton, "mt-6")}>View Stock</Link>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <div>
        <PageBackButton href="/supermarket/stock" prefetch />
        <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.045em] text-navy">Stock Adjustment</h1>
        <p className="mt-1.5 text-[13px] text-slate-500">Use this only for corrections, damage, loss or expiry. Supplier receipts belong in Purchasing.</p>
      </div>
      <section className={glassPanel}>
        <AdjustmentProductSelector products={rows} selectedId={selectedId} onSelect={setSelectedId} />
        {selected ? <p className="mt-3 text-[13px] text-slate-500">System stock {selected.stock} · {location} {location === "Main Store" ? selected.mainStore : selected.salesFloor}</p> : null}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Adjustment type</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as StockAdjustmentKind)} className={inputClass}>
              {STOCK_ADJUSTMENT_KINDS.filter((item) => item !== "Opening Balance").map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          {kind === "Correction" ? (
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Direction</span>
              <select value={direction} onChange={(event) => setDirection(event.target.value as "increase" | "decrease")} className={inputClass}>
                <option value="decrease">Decrease</option>
                <option value="increase">Increase</option>
              </select>
            </label>
          ) : null}
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Location</span>
            <select value={location} onChange={(event) => setLocation(event.target.value as StockLocation)} className={inputClass}>
              {STOCK_LOCATIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Quantity *</span>
            <input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Reason *</span>
            <select value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass}>
              {REASONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        {error ? <p className="mt-3 text-[12.5px] text-[#c45b66]">{error}</p> : null}
      </section>
      <div className="flex flex-wrap justify-end gap-2">
        <Link href="/supermarket/stock" className={secondaryButton}>Cancel</Link>
        <button type="button" onClick={confirm} className={primaryButton}>Save Adjustment</button>
      </div>
    </div>
  );
}

function AdjustmentProductSelector({
  products,
  selectedId,
  onSelect,
}: {
  products: ProductStockRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const selected = products.find((item) => item.id === selectedId) ?? null;

  const sorted = useMemo(
    () => products.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [products],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        item.sku.toLowerCase().includes(needle) ||
        item.barcode.toLowerCase().includes(needle),
    );
  }, [sorted, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PRODUCT_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PRODUCT_PAGE_SIZE, safePage * PRODUCT_PAGE_SIZE);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function search(value: string) {
    setQuery(value);
    setPage(1);
    setOpen(true);
  }

  function choose(id: string) {
    onSelect(id);
    setOpen(false);
    setQuery("");
    setPage(1);
  }

  return (
    <div ref={rootRef} className="relative">
      <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Product *</span>
      {selected && !open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setQuery("");
            setPage(1);
          }}
          className={cn(inputClass, "flex items-center justify-between gap-3 text-left")}
        >
          <span className="min-w-0 truncate font-medium">{selected.name}</span>
          <Check className="h-4 w-4 shrink-0 text-[#4f7a5e]" strokeWidth={2.2} />
        </button>
      ) : (
        <label className="relative block">
          <span className="sr-only">Search product</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => search(event.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Search product..."
            className={cn(inputClass, "pl-10")}
          />
        </label>
      )}
      {open ? (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-[16px] border border-white/80 bg-white/92 shadow-[0_16px_40px_rgba(15,35,64,0.10),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl">
          {pageRows.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[13.5px] font-medium text-navy">No products found</p>
              <p className="mt-1 text-[12.5px] text-slate-400">Try a different product name, SKU or barcode.</p>
            </div>
          ) : (
            <div className="max-h-[min(22rem,55vh)] overflow-y-auto py-1">
              {pageRows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => choose(item.id)}
                  className={cn(
                    "flex w-full flex-col px-3.5 py-2.5 text-left transition hover:bg-[#f5f8fc]",
                    selectedId === item.id && "bg-white",
                  )}
                >
                  <span className="text-[13.5px] font-semibold tracking-[-0.02em] text-navy">{item.name}</span>
                  <span className="mt-0.5 text-[12px] text-slate-400">
                    {item.sku}
                    {item.barcode ? ` · ${item.barcode}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
          {filtered.length > 0 && totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t border-black/[0.04] px-3 py-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                {productPageItems(safePage, totalPages).map((item, index) =>
                  item === "…" ? (
                    <span key={`ellipsis-${index}`} className="px-1 text-[12px] text-slate-400">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item)}
                      className={cn(
                        "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[12px] font-semibold transition",
                        item === safePage ? "bg-[#0b2244] text-white" : "text-navy hover:bg-white",
                      )}
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage >= totalPages}
                className="shrink-0 text-[12.5px] font-semibold text-navy disabled:text-slate-300"
              >
                Next →
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function productPageItems(current: number, total: number): Array<number | "…"> {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  const items: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("…");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push("…");
  items.push(total);
  return items;
}
