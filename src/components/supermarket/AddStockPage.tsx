"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Plus, Search } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { APP_TIMEZONE } from "@/lib/config/app";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import type { AuthUser } from "@/lib/auth/types";
import {
  currentStockFor,
  useSupermarketInventory,
  type SupermarketProduct,
} from "@/lib/data/supermarket-inventory";

const card =
  "rounded-[24px] border border-white/80 bg-white/82 px-5 py-6 shadow-[0_12px_36px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl sm:px-6 sm:py-7";
const inputClass =
  "h-12 w-full rounded-[14px] border border-[#dbe4ef] bg-white px-3.5 text-[14px] text-navy shadow-[0_1px_2px_rgba(15,35,64,0.03)] outline-none transition placeholder:text-slate-400 focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10";

type SuccessState = {
  productName: string;
  quantity: number;
  newStock: number;
  reference: string;
};

function canReceiveStock(user: AuthUser | null, isSuperAdmin: boolean) {
  if (isSuperAdmin) return true;
  if (!user) return false;
  if (isOwnerRole(user.roleCode) || user.permissions.includes("*") || user.modules.includes("*")) {
    return true;
  }
  return user.permissions.some((matcher) => matchPermission("supermarket.stock.edit", matcher));
}

function canEditSellingPrice(user: AuthUser | null, isSuperAdmin: boolean) {
  if (isSuperAdmin) return true;
  if (!user) return false;
  if (isOwnerRole(user.roleCode) || user.permissions.includes("*") || user.modules.includes("*")) {
    return true;
  }
  return user.permissions.some((matcher) => matchPermission("supermarket.products.edit", matcher));
}

function parseAmount(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return NaN;
  return Number(digits);
}

function moneyDisplay(value: string) {
  if (!value) return "";
  const amount = parseAmount(value);
  return Number.isFinite(amount) ? amount.toLocaleString("en-US") : value;
}

function formatReceivedDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: APP_TIMEZONE,
  }).format(date);
}

function formatReceivedTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: APP_TIMEZONE,
  }).format(date);
}

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

function emptySubscribe() {
  return () => {};
}

export function AddStockPage() {
  const router = useRouter();
  const { user, isSuperAdmin } = useAuth();
  const allowed = canReceiveStock(user, isSuperAdmin());
  const sellingPriceEditable = canEditSellingPrice(user, isSuperAdmin());
  const inventory = useSupermarketInventory();
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [buyingPrice, setBuyingPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [supplier, setSupplier] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState("");
  const [supplierError, setSupplierError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [receivedAt, setReceivedAt] = useState<Date | null>(null);
  const [prefillDone, setPrefillDone] = useState(false);

  if (isClient && receivedAt === null) {
    setReceivedAt(new Date());
  }
  if (isClient && !prefillDone) {
    setPrefillDone(true);
    const productId = new URLSearchParams(window.location.search).get("product");
    const match = productId ? inventory.products.find((item) => item.id === productId) : undefined;
    if (match) {
      setSelectedId(match.id);
      setBuyingPrice(String(match.buyingPrice));
      setSellingPrice(String(match.sellingPrice));
    }
  }

  const selected = inventory.products.find((item) => item.id === selectedId) ?? null;
  const currentStock = selected ? currentStockFor(selected.id, inventory.batches) : 0;
  const qtyValue = Number(quantity);
  const buyValue = parseAmount(buyingPrice);
  const quantityValid = Number.isFinite(qtyValue) && qtyValue > 0;
  const buyingValid = Number.isFinite(buyValue) && buyValue >= 0;
  const totalCost = quantityValid && buyingValid ? qtyValue * buyValue : 0;
  const newStock = selected && quantityValid ? currentStock + qtyValue : currentStock;
  const reference = inventory.nextGoodsReceivedReference();

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = inventory.products;
    if (!needle) return rows.slice(0, 8);
    return rows
      .filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          item.sku.toLowerCase().includes(needle) ||
          item.barcode.toLowerCase().includes(needle),
      )
      .slice(0, 8);
  }, [inventory.products, query]);

  const filteredSuppliers = useMemo(() => {
    const names = inventory.suppliers.map((item) => item.name);
    const needle = supplierQuery.trim().toLowerCase();
    if (!needle) return names;
    return names.filter((item) => item.toLowerCase().includes(needle));
  }, [inventory.suppliers, supplierQuery]);

  useEffect(() => {
    if (!allowed) router.replace("/supermarket/stock");
  }, [allowed, router]);

  function selectProduct(product: SupermarketProduct) {
    setSelectedId(product.id);
    setQuery("");
    setSearchOpen(false);
    setBuyingPrice(String(product.buyingPrice));
    setSellingPrice(String(product.sellingPrice));
    setErrors((current) => {
      const next = { ...current };
      delete next.product;
      return next;
    });
  }

  function resetForm() {
    setSuccess(null);
    setSelectedId(null);
    setQuery("");
    setQuantity("");
    setBuyingPrice("");
    setSellingPrice("");
    setBatchNumber("");
    setExpiryDate("");
    setSupplier("");
    setSupplierQuery("");
    setSupplierOpen(false);
    setAddSupplierOpen(false);
    setNewSupplier("");
    setSupplierError("");
    setErrors({});
    setReceivedAt(new Date());
    searchRef.current?.focus();
  }

  function addSupplier() {
    const result = inventory.addInventorySupplier(newSupplier);
    if (result.error) {
      setSupplierError(result.error);
      return;
    }
    setSupplier(result.name);
    setSupplierQuery(result.name);
    setNewSupplier("");
    setSupplierError("");
    setAddSupplierOpen(false);
  }

  function receive() {
    const nextErrors: Record<string, string> = {};
    const qty = Number(quantity);
    const price = parseAmount(buyingPrice);
    const sell = parseAmount(sellingPrice);
    const expiry = expiryDate.trim();
    const today = todayIsoDate();

    if (!selected) nextErrors.product = "Select a product.";
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      nextErrors.quantity = "Enter a quantity greater than 0.";
    }
    if (!Number.isFinite(price) || price < 0) {
      nextErrors.buyingPrice = "Enter a buying price that is not negative.";
    }
    if (sellingPriceEditable && sellingPrice && (!Number.isFinite(sell) || sell < 0)) {
      nextErrors.sellingPrice = "Enter a valid selling price.";
    }
    if (expiry) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || Number.isNaN(new Date(`${expiry}T00:00:00`).getTime())) {
        nextErrors.expiryDate = "Enter a valid expiry date.";
      } else if (expiry <= today) {
        nextErrors.expiryDate = "Expiry date must be a future date.";
      }
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const result = inventory.receiveStock({
      productId: selected!.id,
      quantity: qty,
      buyingPrice: price,
      sellingPrice: sellingPriceEditable && Number.isFinite(sell) ? sell : undefined,
      batchNumber: batchNumber.trim() || undefined,
      expiryDate: expiry || null,
      supplier: supplier.trim() || undefined,
      receivedAt: (receivedAt ?? new Date()).toISOString(),
      reference,
      user: user?.name || "Storekeeper",
      type: "Received",
    });

    if (result.error || !result.movement) {
      setErrors({ quantity: result.error || "Unable to receive stock." });
      return;
    }

    setSuccess({
      productName: selected!.name,
      quantity: qty,
      newStock: result.newStock,
      reference: result.movement.reference,
    });
  }

  if (!allowed) return null;

  if (success) {
    return (
      <div className="page-enter min-w-0 pb-8">
        <Link
          href="/supermarket/stock"
          className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500 transition hover:text-navy"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.9} />
          Back to Stock
        </Link>
        <div className={cn(card, "mx-auto mt-6 max-w-lg px-6 py-10 text-center sm:px-10")}>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#e8f6ee] text-[#1f8a4c]">
            <Check className="h-7 w-7" strokeWidth={2.4} />
          </span>
          <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.04em] text-navy">Stock Received Successfully</h1>
          <p className="mt-4 text-[16px] font-semibold tracking-[-0.02em] text-navy">{success.productName}</p>
          <p className="mt-1 text-[15px] font-medium text-[#1f8a4c]">+{success.quantity} units</p>
          <p className="mt-5 text-[12px] font-medium uppercase tracking-[0.14em] text-slate-400">New Stock</p>
          <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-navy">{success.newStock} units</p>
          <p className="mt-5 text-[12px] font-medium uppercase tracking-[0.14em] text-slate-400">Reference</p>
          <p className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-navy">{success.reference}</p>
          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/supermarket/stock"
              className="inline-flex h-11 items-center justify-center rounded-full bg-[#0b2244] px-5 text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(11,34,68,0.22)] transition hover:bg-[#102a52]"
            >
              View Stock
            </Link>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/80 bg-white/90 px-5 text-[13.5px] font-semibold text-navy shadow-[0_4px_12px_rgba(15,35,64,0.05)] transition hover:bg-white"
            >
              Add Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter min-w-0 pb-8">
      <Link
        href="/supermarket/stock"
        className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500 transition hover:text-navy"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.9} />
        Back to Stock
      </Link>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">Add Stock</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Receive new inventory into the supermarket.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/supermarket/stock"
            className="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-white/80 bg-white/90 px-4 text-[13.5px] font-semibold text-navy shadow-[0_4px_12px_rgba(15,35,64,0.05)] transition duration-150 active:scale-[0.985] sm:flex-none"
          >
            Cancel
          </Link>
          <button
            type="submit"
            form="add-stock-form"
            className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-[#0b2244] px-4 text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(11,34,68,0.22)] transition duration-150 hover:bg-[#102a52] active:scale-[0.985] sm:flex-none"
          >
            Receive Stock
          </button>
        </div>
      </div>

      <form
        id="add-stock-form"
        className="mt-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.8fr)]"
        onSubmit={(event) => {
          event.preventDefault();
          receive();
        }}
      >
        <div className="min-w-0 space-y-5">
          <section className={card}>
            <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">Product</h2>
            <p className="mt-1 text-[13px] text-slate-500">Search by product name, SKU or barcode.</p>
            <div className="relative mt-5">
              <Field label="Search / Select Product" required error={errors.product}>
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.9} />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setSearchOpen(true);
                    }}
                    onFocus={() => setSearchOpen(true)}
                    placeholder="Search products, SKU, barcode..."
                    className={cn(inputClass, "pl-10")}
                    autoComplete="off"
                  />
                </span>
              </Field>
              {searchOpen ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-10 cursor-default"
                    aria-label="Close product search"
                    onClick={() => setSearchOpen(false)}
                  />
                  <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-[16px] border border-[#dbe4ef] bg-white/96 shadow-[0_18px_40px_rgba(15,35,64,0.12)] backdrop-blur-xl">
                    {matches.length === 0 ? (
                      <p className="px-3.5 py-3 text-[13px] text-slate-500">No matching products.</p>
                    ) : (
                      matches.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => selectProduct(item)}
                          className={cn(
                            "flex w-full flex-col px-3.5 py-2.5 text-left transition hover:bg-[#f4f7fb]",
                            selectedId === item.id && "bg-[#f4f7fb]",
                          )}
                        >
                          <span className="text-[13.5px] font-semibold text-navy">{item.name}</span>
                          <span className="text-[12px] text-slate-500">
                            {item.sku} · {item.barcode || "No barcode"}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {selected ? (
              <div className="mt-5 rounded-[16px] border border-[#e6edf4] bg-[#f8fafc] px-4 py-4">
                <p className="text-[16px] font-semibold tracking-[-0.02em] text-navy">{selected.name}</p>
                <dl className="mt-3 grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-3">
                  <div>
                    <dt className="text-slate-400">SKU</dt>
                    <dd className="mt-0.5 font-medium text-navy">{selected.sku}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Category</dt>
                    <dd className="mt-0.5 font-medium text-navy">{selected.category}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Current Stock</dt>
                    <dd className="mt-0.5 font-medium text-navy">{currentStock}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </section>

          <section className={card}>
            <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">Stock Details</h2>
            <p className="mt-1 text-[13px] text-slate-500">Quantity, cost and batch information for this receipt.</p>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Quantity Received" required error={errors.quantity}>
                <input
                  inputMode="numeric"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                  className={inputClass}
                />
              </Field>
              <Field label="Buying Price" required error={errors.buyingPrice} hint="Cost paid to supplier.">
                <span className="flex h-12 items-center rounded-[14px] border border-[#dbe4ef] bg-white px-3.5 shadow-[0_1px_2px_rgba(15,35,64,0.03)] focus-within:border-[#9bb6e0] focus-within:ring-4 focus-within:ring-[#5b82c4]/10">
                  <span className="pr-2 text-[13px] text-slate-400">TZS</span>
                  <input
                    inputMode="numeric"
                    value={moneyDisplay(buyingPrice)}
                    onChange={(event) => setBuyingPrice(event.target.value.replace(/[^\d]/g, ""))}
                    placeholder="0"
                    className="h-full w-full bg-transparent text-[14px] text-navy outline-none"
                  />
                </span>
              </Field>
              <Field label="Batch Number">
                <input
                  value={batchNumber}
                  onChange={(event) => setBatchNumber(event.target.value)}
                  placeholder="Optional"
                  className={inputClass}
                />
              </Field>
              <Field label="Expiry Date" error={errors.expiryDate}>
                <input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className={inputClass} />
              </Field>
              <Field label="Selling Price" error={errors.sellingPrice} hint={sellingPriceEditable ? undefined : "Existing product selling price."}>
                {sellingPriceEditable ? (
                  <span className="flex h-12 items-center rounded-[14px] border border-[#dbe4ef] bg-white px-3.5 shadow-[0_1px_2px_rgba(15,35,64,0.03)] focus-within:border-[#9bb6e0] focus-within:ring-4 focus-within:ring-[#5b82c4]/10">
                    <span className="pr-2 text-[13px] text-slate-400">TZS</span>
                    <input
                      inputMode="numeric"
                      value={moneyDisplay(sellingPrice)}
                      onChange={(event) => setSellingPrice(event.target.value.replace(/[^\d]/g, ""))}
                      placeholder="0"
                      className="h-full w-full bg-transparent text-[14px] text-navy outline-none"
                    />
                  </span>
                ) : (
                  <p className="flex h-12 items-center rounded-[14px] border border-[#e6edf4] bg-[#f8fafc] px-3.5 text-[14px] font-medium text-navy">
                    {selected ? formatTzs(selected.sellingPrice) : "—"}
                  </p>
                )}
              </Field>
            </div>
          </section>

          <section className={card}>
            <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">Supplier</h2>
            <p className="mt-1 text-[13px] text-slate-500">Optional supplier for this goods received note.</p>
            <div className="mt-5">
              <Field label="Supplier">
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.9} />
                  <input
                    value={supplierQuery}
                    onChange={(event) => {
                      setSupplierQuery(event.target.value);
                      setSupplierOpen(true);
                    }}
                    onFocus={() => setSupplierOpen(true)}
                    placeholder="Search or select supplier"
                    className={cn(inputClass, "pl-10")}
                    autoComplete="off"
                  />
                </span>
              </Field>
              {supplierOpen ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-10 cursor-default"
                    aria-label="Close supplier search"
                    onClick={() => setSupplierOpen(false)}
                  />
                  <div className="relative z-20 mt-2 overflow-hidden rounded-[16px] border border-[#dbe4ef] bg-white/96 shadow-[0_18px_40px_rgba(15,35,64,0.12)] backdrop-blur-xl">
                    {filteredSuppliers.length === 0 ? (
                      <p className="px-3.5 py-3 text-[13px] text-slate-500">No matching suppliers.</p>
                    ) : (
                      filteredSuppliers.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            setSupplier(item);
                            setSupplierQuery(item);
                            setSupplierOpen(false);
                          }}
                          className={cn(
                            "flex w-full px-3.5 py-2.5 text-left text-[13.5px] font-medium text-navy transition hover:bg-[#f4f7fb]",
                            supplier === item && "bg-[#f4f7fb]",
                          )}
                        >
                          {item}
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : null}
              {supplier && !supplierOpen ? (
                <p className="mt-2 text-[12.5px] text-slate-500">Selected: {supplier}</p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setAddSupplierOpen(true);
                  setSupplierError("");
                }}
                className="mt-3 inline-flex h-10 items-center justify-center gap-1 rounded-full border border-white/80 bg-white px-3.5 text-[13px] font-medium text-navy shadow-[0_4px_12px_rgba(15,35,64,0.05)] transition hover:bg-[#f7f9fc]"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                Add Supplier
              </button>
            </div>
            {addSupplierOpen ? (
              <div className="mt-4 rounded-[16px] border border-[#e6edf4] bg-[#f8fafc] p-4">
                <Field label="Supplier name" error={supplierError}>
                  <input
                    autoFocus
                    value={newSupplier}
                    onChange={(event) => setNewSupplier(event.target.value)}
                    placeholder="e.g. Kibo Oils"
                    className={inputClass}
                  />
                </Field>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAddSupplierOpen(false);
                      setNewSupplier("");
                      setSupplierError("");
                    }}
                    className="h-9 rounded-full px-3 text-[12.5px] font-medium text-slate-500 hover:text-navy"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addSupplier}
                    className="h-9 rounded-full bg-[#0b2244] px-3.5 text-[12.5px] font-medium text-white"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="min-w-0 space-y-5 xl:sticky xl:top-20">
          <section className={card}>
            <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">Receiving Summary</h2>
            <p className="mt-3 text-[16px] font-semibold tracking-[-0.02em] text-navy">{selected?.name ?? "Select a product"}</p>
            <dl className="mt-5 space-y-3.5 text-[13.5px]">
              <SummaryRow label="Quantity" value={quantityValid ? `${qtyValue} units` : "—"} />
              <SummaryRow label="Buying Price" value={buyingValid ? formatTzs(buyValue) : "—"} />
              <SummaryRow label="Total Cost" value={quantityValid && buyingValid ? formatTzs(totalCost) : "—"} />
              <SummaryRow label="Current Stock" value={selected ? String(currentStock) : "—"} />
              <SummaryRow label="New Stock" value={selected && quantityValid ? String(newStock) : "—"} emphasize />
            </dl>
          </section>

          <section className={card}>
            <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">Receiving Information</h2>
            <dl className="mt-5 space-y-3.5 text-[13.5px]">
              <SummaryRow label="Received By" value={user?.name || "Storekeeper"} />
              <SummaryRow label="Date" value={receivedAt ? formatReceivedDate(receivedAt) : "\u00a0"} />
              <SummaryRow label="Time" value={receivedAt ? formatReceivedTime(receivedAt) : "\u00a0"} />
              <SummaryRow label="Reference" value={reference} />
            </dl>
          </section>
        </aside>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end xl:col-span-2">
          <Link
            href="/supermarket/stock"
            className="inline-flex h-11 items-center justify-center rounded-full border border-white/80 bg-white/90 px-5 text-[13.5px] font-semibold text-navy shadow-[0_4px_12px_rgba(15,35,64,0.05)]"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#0b2244] px-5 text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(11,34,68,0.22)] transition hover:bg-[#102a52]"
          >
            Receive Stock
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[13px] font-medium text-navy">
        {label}
        {required ? <span className="text-[#c24646]"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-[12px] text-slate-400">{hint}</span> : null}
      {error ? <span className="mt-1.5 block text-[12px] text-[#8a5a5a]">{error}</span> : null}
    </label>
  );
}

function SummaryRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn("text-right font-medium text-navy", emphasize && "text-[16px] font-semibold tracking-[-0.02em]")}>
        {value}
      </dd>
    </div>
  );
}
