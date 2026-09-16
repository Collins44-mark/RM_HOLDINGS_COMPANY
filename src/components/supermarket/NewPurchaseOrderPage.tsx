"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Search, X } from "lucide-react";
import { APP_TIMEZONE } from "@/lib/config/app";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { useSupermarketInventory, type SupermarketProduct } from "@/lib/data/supermarket-inventory";
import { glassPanel, inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";

type LineDraft = {
  key: string;
  productId: string;
  quantity: string;
  buyingPrice: string;
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

export function NewPurchaseOrderPage() {
  const router = useRouter();
  const inventory = useSupermarketInventory();
  const poNumber = inventory.nextPurchaseOrderNumber();
  const [supplierId, setSupplierId] = useState("sup-coastal");
  const [orderDate, setOrderDate] = useState(todayIsoDate);
  const [expectedDate, setExpectedDate] = useState("2026-09-20");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [lines, setLines] = useState<LineDraft[]>([
    { key: "line-1", productId: "", quantity: "", buyingPrice: "" },
  ]);
  const [productQuery, setProductQuery] = useState("");
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedSupplier = inventory.suppliers.find((item) => item.id === supplierId) ?? null;
  const parsedLines = lines
    .map((line) => {
      const product = inventory.products.find((item) => item.id === line.productId);
      const quantity = Number(line.quantity);
      const buyingPrice = Number(line.buyingPrice);
      if (!product || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(buyingPrice) || buyingPrice < 0) {
        return null;
      }
      return { product, quantity, buyingPrice, total: quantity * buyingPrice };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));
  const subtotal = parsedLines.reduce((sum, line) => sum + line.total, 0);
  const discountValue = Math.max(0, Number(discount) || 0);
  const taxValue = Math.max(0, Number(tax) || 0);
  const grandTotal = Math.max(0, subtotal - discountValue + taxValue);

  const matches = useMemo(() => {
    const needle = productQuery.trim().toLowerCase();
    return inventory.products
      .filter((item) => item.isActive)
      .filter((item) =>
        !needle
          ? true
          : item.name.toLowerCase().includes(needle) ||
            item.sku.toLowerCase().includes(needle) ||
            item.barcode.toLowerCase().includes(needle),
      )
      .slice(0, 8);
  }, [inventory.products, productQuery]);

  function selectProduct(lineKey: string, product: SupermarketProduct) {
    setLines((current) =>
      current.map((line) =>
        line.key === lineKey
          ? { ...line, productId: product.id, buyingPrice: line.buyingPrice || String(product.buyingPrice) }
          : line,
      ),
    );
    setActiveLine(null);
    setProductQuery("");
  }

  function save(status: "Draft" | "Sent") {
    const nextErrors: Record<string, string> = {};
    if (!supplierId) nextErrors.supplier = "Select a supplier.";
    if (!orderDate) nextErrors.orderDate = "Enter the order date.";
    if (!expectedDate) nextErrors.expectedDate = "Enter the expected delivery date.";
    if (!parsedLines.length) nextErrors.lines = "Add at least one product with quantity and buying price.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    const result = inventory.createPurchaseOrder({
      supplierId,
      orderDate,
      expectedDate,
      notes,
      discount: discountValue,
      tax: taxValue,
      status,
      lines: parsedLines.map((line) => ({
        productId: line.product.id,
        quantity: line.quantity,
        buyingPrice: line.buyingPrice,
      })),
    });
    if (result.error || !result.order) {
      setErrors({ lines: result.error || "Unable to save this purchase order." });
      return;
    }
    router.push(`/supermarket/purchasing/${result.order.id}`);
  }

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <div>
        <Link href="/supermarket/purchasing" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500 transition hover:text-navy">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.9} />
          Back to Purchasing
        </Link>
        <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">New Purchase Order</h1>
        <p className="mt-1.5 text-[13px] text-slate-500">Create a supplier order, then save as draft or send.</p>
      </div>

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Purchase Order</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">PO Number</span>
            <input value={poNumber} readOnly className={cn(inputClass, "bg-[#f7f9fc] text-slate-500")} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Supplier *</span>
            <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className={inputClass}>
              {inventory.suppliers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {errors.supplier ? <p className="mt-1.5 text-[12px] text-slate-500">{errors.supplier}</p> : null}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Order Date *</span>
            <input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Expected Delivery Date *</span>
            <input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} className={inputClass} />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className={cn(inputClass, "h-auto py-3")} />
          </label>
        </div>
        {selectedSupplier ? <p className="mt-3 text-[12.5px] text-slate-400">{selectedSupplier.contactPerson} · {selectedSupplier.phone}</p> : null}
      </section>

      <section className={glassPanel}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Products</h2>
          <button
            type="button"
            onClick={() => setLines((current) => [...current, { key: `line-${Date.now()}`, productId: "", quantity: "", buyingPrice: "" }])}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-navy"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add product
          </button>
        </div>
        <div className="mt-5 space-y-4">
          {lines.map((line) => {
            const product = inventory.products.find((item) => item.id === line.productId);
            const qty = Number(line.quantity);
            const price = Number(line.buyingPrice);
            const total = Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0;
            return (
              <div key={line.key} className="rounded-[18px] border border-white/80 bg-white/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <label className="relative min-w-0 flex-1">
                    <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Product</span>
                    <Search className="pointer-events-none absolute left-3.5 top-[42px] h-3.5 w-3.5 text-slate-400" />
                    <input
                      value={activeLine === line.key ? productQuery : product?.name ?? ""}
                      onFocus={() => {
                        setActiveLine(line.key);
                        setProductQuery(product?.name ?? "");
                      }}
                      onChange={(event) => {
                        setActiveLine(line.key);
                        setProductQuery(event.target.value);
                      }}
                      placeholder="Search products"
                      className={cn(inputClass, "pl-10")}
                    />
                    {activeLine === line.key ? (
                      <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[14px] border border-white/80 bg-white/95 shadow-[0_12px_32px_rgba(15,35,64,0.12)]">
                        {matches.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => selectProduct(line.key, item)}
                            className="flex w-full flex-col px-3.5 py-2.5 text-left hover:bg-[#f5f8fc]"
                          >
                            <span className="text-[13px] font-semibold text-navy">{item.name}</span>
                            <span className="text-[12px] text-slate-400">{item.sku}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </label>
                  {lines.length > 1 ? (
                    <button type="button" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} className="mt-8 text-slate-400 hover:text-navy" aria-label="Remove product">
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label>
                    <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Quantity</span>
                    <input inputMode="numeric" value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => (item.key === line.key ? { ...item, quantity: event.target.value } : item)))} className={inputClass} />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Buying Price</span>
                    <input inputMode="numeric" value={line.buyingPrice} onChange={(event) => setLines((current) => current.map((item) => (item.key === line.key ? { ...item, buyingPrice: event.target.value } : item)))} className={inputClass} />
                  </label>
                  <div>
                    <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Line Total</span>
                    <p className="flex h-12 items-center text-[14px] font-semibold text-navy">{formatTzs(total)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {errors.lines ? <p className="mt-3 text-[12.5px] text-slate-500">{errors.lines}</p> : null}
      </section>

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Summary</h2>
        <dl className="mt-4 space-y-2.5 text-[14px]">
          <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="font-semibold text-navy">{formatTzs(subtotal)}</dd></div>
          <label className="flex items-center justify-between gap-4">
            <span className="text-slate-500">Discount</span>
            <input inputMode="numeric" value={discount} onChange={(event) => setDiscount(event.target.value)} className={cn(inputClass, "h-10 w-36 text-right")} />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="text-slate-500">Tax</span>
            <input inputMode="numeric" value={tax} onChange={(event) => setTax(event.target.value)} className={cn(inputClass, "h-10 w-36 text-right")} />
          </label>
          <div className="flex justify-between border-t border-[#d5dee8]/80 pt-3">
            <dt className="font-medium text-navy">Grand Total</dt>
            <dd className="text-[18px] font-semibold tracking-[-0.03em] text-navy">{formatTzs(grandTotal)}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href="/supermarket/purchasing" className={secondaryButton}>
          Cancel
        </Link>
        <button type="button" onClick={() => save("Draft")} className={secondaryButton}>
          Save Draft
        </button>
        <button type="button" onClick={() => save("Sent")} className={primaryButton}>
          Send Order
        </button>
      </div>
    </div>
  );
}
