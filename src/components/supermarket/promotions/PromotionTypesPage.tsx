"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { inputClass, primaryButton, secondaryButton, glassCard, tableHead } from "@/components/supermarket/purchasing-ui";
import { PromotionConfirmDialog } from "@/components/supermarket/promotions/PromotionConfirmDialog";
import {
  updatePromotionType,
  useSupermarketPromotions,
} from "@/lib/supermarket/client-stores";

export function PromotionTypesPage() {
  const live = useSupermarketPromotions();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const rows = useMemo(
    () =>
      live.types.map((item) => ({
        ...item,
        usage: live.promotions.filter((promo) => promo.type === item.code || promo.typeId === item.id).length,
      })),
    [live.types, live.promotions],
  );

  const editing = rows.find((item) => item.id === editingId) ?? null;

  function openEdit(item: (typeof rows)[number]) {
    setEditingId(item.id);
    setName(item.name);
    setDescription(item.description);
    setError("");
  }

  async function saveEdit() {
    if (!editing) return;
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    const result = await updatePromotionType({
      id: editing.id,
      name: name.trim(),
      description: description.trim(),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditingId(null);
  }

  async function toggleActive(id: string, isActive: boolean) {
    await updatePromotionType({
      id,
      name: rows.find((r) => r.id === id)?.name ?? "",
      description: rows.find((r) => r.id === id)?.description ?? "",
      isActive,
    });
  }

  return (
    <div className="page-enter min-w-0 space-y-5 pb-10">
      <PageBackButton href="/supermarket/promotions" prefetch />
      <header className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">
            Promotion Types
          </h1>
          <p className="mt-1.5 text-[13px] leading-5 text-slate-500">
            Configure the promotion types available when creating offers.
          </p>
          {live.error ? <p className="mt-2 text-[12.5px] text-[#c45b66]">{live.error}</p> : null}
        </div>
        <Link href="/supermarket/promotions" prefetch className={cn(secondaryButton, "w-full sm:w-auto")}>
          Back to Promotions
        </Link>
      </header>

      <section className={cn(glassCard, "overflow-hidden")}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className={tableHead}>
              <tr>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium">Usage</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-white/50">
                  <td className="px-5 py-3.5">
                    <p className="text-[13.5px] font-semibold text-navy">{row.name}</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">{row.description || "—"}</p>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-slate-600">{row.code}</td>
                  <td className="px-5 py-3.5 text-[13px] text-slate-600">{row.usage}</td>
                  <td className="px-5 py-3.5 text-[13px] text-slate-600">
                    {row.isActive ? "Active" : "Inactive"}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openEdit(row)} className="text-[12.5px] font-medium text-navy">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleActive(row.id, !row.isActive)}
                        className="text-[12.5px] font-medium text-slate-500"
                      >
                        {row.isActive ? "Deactivate" : "Activate"}
                      </button>
                      {row.usage === 0 ? (
                        <button
                          type="button"
                          onClick={() => setDeleteId(row.id)}
                          className="text-[12.5px] font-medium text-[#c45b66]"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-[13.5px] text-slate-500">
                    {live.loaded ? "No promotion types found." : "Loading…"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {editing ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={() => setEditingId(null)} />
          <div className="relative z-[81] w-full max-w-md rounded-[24px] border border-white/80 bg-white/95 p-5 shadow-[0_24px_60px_rgba(15,35,64,0.16)]">
            <h2 className="text-[18px] font-semibold text-navy">Edit Promotion Type</h2>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={cn(inputClass, "min-h-[88px] py-2.5")}
              />
            </label>
            {error ? <p className="mt-2 text-[12.5px] text-[#c45b66]">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingId(null)} className={secondaryButton}>
                Cancel
              </button>
              <button type="button" disabled={saving} onClick={() => void saveEdit()} className={primaryButton}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PromotionConfirmDialog
        open={Boolean(deleteId)}
        title="Delete Promotion Type?"
        message="Unused promotion types can be removed. Types in use must stay for existing promotions."
        confirmLabel="Delete"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          // Soft-delete: deactivate instead of hard delete to preserve schema safety.
          if (deleteId) void toggleActive(deleteId, false);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
