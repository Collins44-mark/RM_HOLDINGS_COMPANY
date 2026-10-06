"use client";

import { useEffect, useMemo, useState } from "react";
import {
  approveStockReconciliationAction,
  getStockReconciliationWorkspaceAction,
  postStockReconciliationAction,
  saveStockReconciliationAction,
} from "@/actions/supermarket/reconciliation";
import { filterClass, inputClass, secondaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { EmptyState } from "@/components/ui/PageHeader";
import { formatTzs } from "@/lib/format/currency";
import { moneyToCents } from "@/lib/supermarket/money";
import { displayStatus, todayInDarEsSalaam, type StockReconciliationHeader, type StockReconciliationItem } from "@/lib/supermarket/reconciliation";
import { reconGlass, ReconActions, ReconTableSkeletonRows, StatusBadge } from "./shared";

type DraftRow = { physical: string; reason: string; notes: string };

export function StockReconciliationPage() {
  const [date, setDate] = useState(todayInDarEsSalaam());
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [header, setHeader] = useState<StockReconciliationHeader | null>(null);
  const [items, setItems] = useState<StockReconciliationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [caps, setCaps] = useState({ canCreate: false, canApprove: false, canPost: false });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = `${date}:${categoryId}:${search}:${page}`;
  const pending = loadedKey !== requestKey;
  const ready = loadedKey !== null;

  useEffect(() => {
    let active = true;
    void getStockReconciliationWorkspaceAction({
      date,
      categoryId: categoryId || null,
      search,
      page,
    }).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setLoadedKey(`${date}:${categoryId}:${search}:${page}`);
        return;
      }
      setError(null);
      setHeader(result.header);
      setItems(result.items);
      setTotal(result.total);
      setPageSize(result.pageSize);
      setCategories(result.categories);
      setCaps({
        canCreate: result.capabilities.canCreate,
        canApprove: result.capabilities.canApprove,
        canPost: result.capabilities.canPost,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of result.items) {
          if (next[item.productId]) continue;
          next[item.productId] = {
            physical: item.physicalQty == null ? "" : String(item.physicalQty),
            reason: item.reason,
            notes: item.notes,
          };
        }
        return next;
      });
      setLoadedKey(`${date}:${categoryId}:${search}:${page}`);
    });
    return () => {
      active = false;
    };
  }, [date, categoryId, search, page]);

  const dirtyCount = useMemo(() => Object.keys(drafts).length, [drafts]);
  const status = displayStatus(header?.status ?? null, moneyToCents(header?.varianceValue));
  const pages = Math.max(1, Math.ceil(total / pageSize));

  function rowItems(): Array<{ productId: string; physicalQty: number | null; reason: string; notes: string }> {
    return items.map((item) => {
      const draft = drafts[item.productId];
      const physicalRaw = draft?.physical ?? "";
      return {
        productId: item.productId,
        physicalQty: physicalRaw === "" ? null : Number.parseInt(physicalRaw, 10),
        reason: draft?.reason ?? item.reason,
        notes: draft?.notes ?? item.notes,
      };
    });
  }

  async function persist(submit: boolean) {
    setSaving(true);
    const result = await saveStockReconciliationAction({
      id: header?.id,
      date,
      categoryId: categoryId || null,
      items: rowItems(),
      submit,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const refreshed = await getStockReconciliationWorkspaceAction({ date, categoryId: categoryId || null, search, page });
    if (refreshed.ok) {
      setHeader(refreshed.header);
      setItems(refreshed.items);
    }
  }

  async function approve() {
    if (!header) return;
    setSaving(true);
    const result = await approveStockReconciliationAction(header.id);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const refreshed = await getStockReconciliationWorkspaceAction({ date, categoryId: categoryId || null, search, page });
    if (refreshed.ok) setHeader(refreshed.header);
  }

  async function post() {
    if (!header) return;
    setSaving(true);
    const result = await postStockReconciliationAction(header.id);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const refreshed = await getStockReconciliationWorkspaceAction({ date, categoryId: categoryId || null, search, page });
    if (refreshed.ok) setHeader(refreshed.header);
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <PageBackButton href="/supermarket/reconciliation" label="Reconciliation" />
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Stock Reconciliation</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">
            Count physical stock against system quantity. Variances post only after approval.
          </p>
        </div>
        <StatusBadge label={status.label} tone={status.tone} />
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <input type="date" className={filterClass} value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} />
        <select className={filterClass} value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <input className={filterClass} placeholder="Search product or SKU" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>
      {dirtyCount > 0 ? <p className="text-[12.5px] text-slate-500">Unsaved counts are kept on this page until you save.</p> : null}
      <div className={`${reconGlass} overflow-hidden`}>
        <div className={tableScrollClass}>
          <table className="min-w-full text-left text-[13px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">System</th>
                <th className="px-4 py-3">Physical</th>
                <th className="px-4 py-3">Variance</th>
                <th className="px-4 py-3">Unit cost</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {pending && !ready ? <ReconTableSkeletonRows rows={5} cols={8} /> : null}
              {!pending || ready
                ? items.map((item) => {
                const draft = drafts[item.productId] ?? { physical: "", reason: "", notes: "" };
                const physical = draft.physical === "" ? null : Number.parseInt(draft.physical, 10);
                const varianceQty = physical == null || Number.isNaN(physical) ? 0 : physical - item.systemQty;
                const varianceValue = varianceQty * moneyToCents(item.unitCost);
                return (
                  <tr key={item.productId} className="border-t border-black/[0.04]">
                    <td className="px-4 py-2.5 font-medium text-navy">{item.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{item.sku}</td>
                    <td className="px-4 py-2.5 tabular-nums">{item.systemQty}</td>
                    <td className="px-4 py-2.5">
                      <input
                        className={`${inputClass} h-9 w-20`}
                        value={draft.physical}
                        inputMode="numeric"
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.productId]: { ...draft, physical: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{varianceQty}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatTzs(moneyToCents(item.unitCost) / 100)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatTzs(varianceValue / 100)}</td>
                    <td className="px-4 py-2.5">
                      <input
                        className={`${inputClass} h-9`}
                        value={draft.reason}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.productId]: { ...draft, reason: e.target.value },
                          }))
                        }
                      />
                    </td>
                  </tr>
                );
              })
                : null}
            </tbody>
          </table>
        </div>
        {ready && items.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No stocktake started" description="Active products for this business unit will appear here. Empty inventory is not an error." />
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-slate-500">
          Page {page} of {pages}
        </p>
        <div className="flex gap-2">
          <button type="button" className={secondaryButton} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <button type="button" className={secondaryButton} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>
      <ReconActions
        canCreate={caps.canCreate}
        canApprove={caps.canApprove}
        canPost={caps.canPost}
        status={header?.status ?? null}
        saving={saving}
        onSave={() => void persist(false)}
        onSubmit={() => void persist(true)}
        onApprove={() => void approve()}
        onPost={() => void post()}
      />
    </div>
  );
}
