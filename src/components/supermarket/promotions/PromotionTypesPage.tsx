"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { inputClass, primaryButton, secondaryButton, glassCard, tableHead } from "@/components/supermarket/purchasing-ui";
import { PromotionConfirmDialog } from "@/components/supermarket/promotions/PromotionConfirmDialog";
import {
  countPromotionsUsingType,
  deletePromotionType,
  getPromotionTypesSnapshot,
  getPromotionsSnapshot,
  setPromotionTypeActive,
  subscribePromotionTypes,
  subscribePromotions,
  upsertPromotionType,
  type PromotionTypeDefinition,
} from "@/lib/data/sample-supermarket-promotions";

export function PromotionTypesPage() {
  const types = useSyncExternalStore(subscribePromotionTypes, getPromotionTypesSnapshot, getPromotionTypesSnapshot);
  useSyncExternalStore(subscribePromotions, getPromotionsSnapshot, getPromotionsSnapshot);
  const [editing, setEditing] = useState<PromotionTypeDefinition | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const rows = useMemo(
    () =>
      types.map((item) => ({
        ...item,
        usage: countPromotionsUsingType(item.code),
      })),
    [types],
  );

  function openEdit(item: PromotionTypeDefinition) {
    setEditing(item);
    setName(item.name);
    setDescription(item.description);
    setError("");
  }

  function saveEdit() {
    if (!editing) return;
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    upsertPromotionType({
      ...editing,
      name: name.trim(),
      description: description.trim(),
    });
    setEditing(null);
  }

  return (
    <div className="page-enter min-w-0 space-y-3.5 pb-10 sm:space-y-4">
      <PageBackButton href="/supermarket/promotions" prefetch />
      <header className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">Promotion Types</h1>
          <p className="mt-1.5 text-[13px] leading-5 text-slate-500">
            Manage the promotion rules available to your supermarket.
          </p>
        </div>
        <Link href="/supermarket/promotions/create" prefetch className={cn(primaryButton, "w-full sm:w-auto")}>
          + Create Promotion
        </Link>
      </header>

      <section className={cn(glassCard, "mt-2 w-full min-w-0 overflow-hidden")}>
        <div className="rm-table-scroll hidden md:block">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className={tableHead}>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Used By</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id} className="border-t border-[#eef2f7]">
                  <td className="px-4 py-3.5 text-[13.5px] font-semibold text-navy">{item.name}</td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-500">{item.description}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className={cn(
                        "inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium",
                        item.isActive ? "bg-[#e7f4ea] text-[#3f8a5a]" : "bg-[#f3f6fa] text-slate-500",
                      )}
                    >
                      {item.isActive ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-navy">
                    {item.usage} promotion{item.usage === 1 ? "" : "s"}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openEdit(item)} className={cn(secondaryButton, "h-8 px-3 text-[12px]")}>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setPromotionTypeActive(item.id, !item.isActive)}
                        className={cn(secondaryButton, "h-8 px-3 text-[12px]")}
                      >
                        {item.isActive ? "Disable" : "Enable"}
                      </button>
                      {item.usage === 0 ? (
                        <button
                          type="button"
                          onClick={() => setDeleteId(item.id)}
                          className={cn(secondaryButton, "h-8 px-3 text-[12px] text-[#c45b66]")}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {rows.map((item) => (
            <article key={item.id} className="rounded-[18px] border border-white/70 bg-white/80 px-4 py-3.5">
              <h3 className="text-[14.5px] font-semibold text-navy">{item.name}</h3>
              <p className="mt-1 text-[12.5px] text-slate-500">{item.description}</p>
              <p className="mt-2 text-[12px] text-slate-400">
                {item.isActive ? "Enabled" : "Disabled"} · {item.usage} promotion{item.usage === 1 ? "" : "s"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => openEdit(item)} className={cn(secondaryButton, "h-8 px-3 text-[12px]")}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setPromotionTypeActive(item.id, !item.isActive)}
                  className={cn(secondaryButton, "h-8 px-3 text-[12px]")}
                >
                  {item.isActive ? "Disable" : "Enable"}
                </button>
                {item.usage === 0 ? (
                  <button
                    type="button"
                    onClick={() => setDeleteId(item.id)}
                    className={cn(secondaryButton, "h-8 px-3 text-[12px] text-[#c45b66]")}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      {editing ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0b2244]/30 px-4 backdrop-blur-[2px]">
          <button type="button" className="absolute inset-0" aria-label="Dismiss" onClick={() => setEditing(null)} />
          <div className="relative z-[91] w-full max-w-[440px] rounded-[22px] border border-white/80 bg-white p-5 shadow-[0_24px_60px_rgba(15,35,64,0.18)]">
            <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">Edit Promotion Type</h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Name *</span>
                <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Description</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  className={cn(inputClass, "h-auto py-3")}
                />
              </label>
              {error ? <p className="text-[12px] text-[#c45b66]">{error}</p> : null}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setEditing(null)} className={cn(secondaryButton, "w-full sm:w-auto")}>
                Cancel
              </button>
              <button type="button" onClick={saveEdit} className={cn(primaryButton, "w-full sm:w-auto")}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PromotionConfirmDialog
        open={Boolean(deleteId)}
        title="Delete Promotion Type?"
        message="Are you sure you want to delete this unused promotion type? This action cannot be undone."
        confirmLabel="Delete Type"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deletePromotionType(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
