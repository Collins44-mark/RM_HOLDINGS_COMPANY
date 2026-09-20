"use client";

import { useEffect, useMemo, useState, type ReactNode, useSyncExternalStore } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Ban,
  Clock3,
  Filter,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Settings2,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  deletePromotion,
  duplicatePromotion,
  effectivePromotionStatus,
  formatPromotionDate,
  getActivePromotionTypeOptions,
  getPromotionsSnapshot,
  MOCK_PROMOTION_CATEGORIES,
  promotionAppliesCount,
  promotionAppliesLabel,
  promotionKpis,
  promotionStatusLabel,
  promotionTypeShortLabel,
  setPromotionStatus,
  subscribePromotions,
  type Promotion,
  type PromotionStatus,
  type PromotionType,
} from "@/lib/data/sample-supermarket-promotions";
import {
  filterClass,
  glassCard,
  primaryButton,
  secondaryButton,
  tableHead,
} from "@/components/supermarket/purchasing-ui";
import { PromotionConfirmDialog } from "@/components/supermarket/promotions/PromotionConfirmDialog";

type StatusTab = "ALL" | "ACTIVE" | "SCHEDULED" | "EXPIRED";
type MenuState = { id: string; top: number; right: number } | null;
type ConfirmState =
  | { type: "delete"; id: string }
  | { type: "deactivate"; id: string }
  | { type: "activate"; id: string }
  | { type: "cancel"; id: string }
  | null;

function statusBadgeClass(status: PromotionStatus) {
  if (status === "ACTIVE") return "bg-[#e7f4ea] text-[#3f8a5a]";
  if (status === "SCHEDULED") return "bg-[#eef2f7] text-[#5b6b7c]";
  if (status === "EXPIRED") return "bg-[#fff2f3] text-[#c45b66]";
  return "bg-[#f3f6fa] text-slate-500";
}

function AppliesToCell({ item }: { item: Promotion }) {
  const count = promotionAppliesCount(item);
  return (
    <>
      <span className="block text-[13px] font-medium text-navy">{promotionAppliesLabel(item)}</span>
      {count != null ? <span className="block text-[12px] text-slate-400">{count} products</span> : null}
    </>
  );
}

export function PromotionsManager() {
  const router = useRouter();
  const items = useSyncExternalStore(subscribePromotions, getPromotionsSnapshot, getPromotionsSnapshot);
  const typeOptions = getActivePromotionTypeOptions();
  const [tab, setTab] = useState<StatusTab>("ALL");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | PromotionType>("all");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [statusFilter, setStatusFilter] = useState<"all" | PromotionStatus>("all");
  const [menu, setMenu] = useState<MenuState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const kpis = useMemo(() => promotionKpis(items), [items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const status = effectivePromotionStatus(item);
      if (tab !== "ALL" && status !== tab) return false;
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (categoryFilter !== "All Categories") {
        const hay = promotionAppliesLabel(item).toLowerCase();
        if (!hay.includes(categoryFilter.toLowerCase())) return false;
      }
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        promotionAppliesLabel(item).toLowerCase().includes(needle)
      );
    });
  }, [items, tab, query, typeFilter, categoryFilter, statusFilter]);

  useEffect(() => {
    if (!menu) return;
    function onPointer() {
      setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    const timer = window.setTimeout(() => window.addEventListener("click", onPointer), 0);
    window.addEventListener("scroll", onPointer, true);
    window.addEventListener("resize", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("click", onPointer);
      window.removeEventListener("scroll", onPointer, true);
      window.removeEventListener("resize", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function openMenu(id: string, button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect();
    const menuHeight = 200;
    const fitsBelow = rect.bottom + 6 + menuHeight <= window.innerHeight - 8;
    setMenu((current) =>
      current?.id === id
        ? null
        : {
            id,
            top: fitsBelow ? rect.bottom + 6 : Math.max(8, rect.top - menuHeight - 6),
            right: Math.max(8, window.innerWidth - rect.right),
          },
    );
  }

  const menuItem = menu ? items.find((item) => item.id === menu.id) : null;
  const menuStatus = menuItem ? effectivePromotionStatus(menuItem) : null;

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10 sm:space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-medium text-slate-400">
            Supermarket <span className="mx-1.5 text-slate-300">›</span>{" "}
            <span className="text-slate-500">Promotions</span>
          </p>
          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">
            Promotions
          </h1>
          <p className="mt-1.5 max-w-xl text-[13.5px] text-slate-500">
            Create and manage offers, discounts and special deals for your supermarket.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link href="/supermarket/promotions/types" prefetch className={cn(secondaryButton, "shrink-0 gap-1.5")}>
            <Settings2 className="h-4 w-4" strokeWidth={1.9} />
            Promotion Types
          </Link>
          <Link href="/supermarket/promotions/create" prefetch className={cn(primaryButton, "shrink-0")}>
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            Create Promotion
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Total Promotions" value={kpis.total} subtitle="All time" icon={<Tag className="h-4 w-4" strokeWidth={1.9} />} />
        <KpiCard title="Active Promotions" value={kpis.active} subtitle="Currently running" icon={<Play className="h-4 w-4" strokeWidth={1.9} />} accent />
        <KpiCard title="Scheduled" value={kpis.scheduled} subtitle="Upcoming offers" icon={<Clock3 className="h-4 w-4" strokeWidth={1.9} />} />
        <KpiCard title="Expired" value={kpis.expired} subtitle="Ended" icon={<Ban className="h-4 w-4" strokeWidth={1.9} />} />
      </section>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "ALL", label: `All Promotions (${kpis.total})` },
            { id: "ACTIVE", label: `Active (${kpis.active})` },
            { id: "SCHEDULED", label: `Scheduled (${kpis.scheduled})` },
            { id: "EXPIRED", label: `Expired (${kpis.expired})` },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-3.5 text-[12.5px] font-medium transition",
              tab === item.id
                ? "bg-[#0b2244] text-white shadow-[0_8px_18px_rgba(11,34,68,0.18)]"
                : "border border-white/70 bg-white/70 text-slate-500 hover:bg-white hover:text-navy",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="rm-filter-bar flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search promotions..."
            className={cn(filterClass, "pl-10")}
          />
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:flex lg:w-auto lg:shrink-0">
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as "all" | PromotionType)}
            className={cn(filterClass, "lg:w-[148px]")}
          >
            <option value="all">All Types</option>
            {typeOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {promotionTypeShortLabel(item.value)}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className={cn(filterClass, "lg:w-[158px]")}
          >
            <option value="All Categories">All Categories</option>
            {MOCK_PROMOTION_CATEGORIES.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | PromotionStatus)}
            className={cn(filterClass, "lg:w-[138px]")}
          >
            <option value="all">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="EXPIRED">Expired</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/70 bg-white/82 text-slate-400 shadow-[0_6px_18px_rgba(15,35,64,0.06)] backdrop-blur-xl transition hover:bg-white hover:text-navy"
          aria-label="Filters"
        >
          <Filter className="h-4 w-4" strokeWidth={1.9} />
        </button>
      </div>

      <section className={cn(glassCard, "overflow-hidden")}>
        <div className="rm-table-scroll hidden md:block">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className={tableHead}>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Promotion Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Applies To</th>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[13.5px] text-slate-400">
                    No promotions match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((item, index) => {
                  const status = effectivePromotionStatus(item);
                  return (
                    <tr key={item.id} className="border-t border-[#eef2f7] transition hover:bg-white/55">
                      <td className="px-4 py-3.5 text-[13px] text-slate-400">{index + 1}</td>
                      <td className="px-4 py-3.5">
                        <span className="block text-[13.5px] font-semibold tracking-[-0.02em] text-navy">{item.name}</span>
                        <span className="mt-0.5 block text-[12px] text-slate-400">{item.description}</span>
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-navy">{promotionTypeShortLabel(item.type)}</td>
                      <td className="px-4 py-3.5">
                        <AppliesToCell item={item} />
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="block text-[13px] text-navy">{formatPromotionDate(item.startDate)}</span>
                        <span className="block text-[12px] text-slate-400">{formatPromotionDate(item.endDate)}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium", statusBadgeClass(status))}>
                          {promotionStatusLabel(status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openMenu(item.id, event.currentTarget);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/75 bg-white/85 text-slate-400 shadow-[0_6px_14px_rgba(15,35,64,0.08)] transition hover:bg-white hover:text-navy"
                          aria-label={`Actions for ${item.name}`}
                          aria-expanded={menu?.id === item.id}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {filtered.length === 0 ? (
            <p className="px-2 py-10 text-center text-[13.5px] text-slate-400">No promotions match your filters.</p>
          ) : (
            filtered.map((item, index) => {
              const status = effectivePromotionStatus(item);
              return (
                <article
                  key={item.id}
                  className="rounded-[18px] border border-white/70 bg-white/80 px-4 py-3.5 shadow-[0_6px_18px_rgba(15,35,64,0.04)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-medium text-slate-400">#{index + 1}</p>
                      <h3 className="mt-0.5 text-[14.5px] font-semibold tracking-[-0.02em] text-navy">{item.name}</h3>
                      <p className="mt-0.5 text-[12.5px] text-slate-400">{item.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => openMenu(item.id, event.currentTarget)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e7ecf3] bg-white text-slate-400"
                      aria-label={`Actions for ${item.name}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2.5 text-[12.5px]">
                    <div>
                      <p className="text-slate-400">Type</p>
                      <p className="mt-0.5 font-medium text-navy">{promotionTypeShortLabel(item.type)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Status</p>
                      <span className={cn("mt-0.5 inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium", statusBadgeClass(status))}>
                        {promotionStatusLabel(status)}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      {menu && menuItem && menuStatus && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[70] min-w-[156px] overflow-hidden rounded-[14px] border border-white/80 bg-white/95 py-1 shadow-[0_16px_40px_rgba(15,35,64,0.14)] backdrop-blur-xl"
              style={{ top: menu.top, right: menu.right }}
              onClick={(event) => event.stopPropagation()}
            >
              <MenuButton
                label="View"
                onClick={() => {
                  setMenu(null);
                  router.push(`/supermarket/promotions/${menuItem.id}`);
                }}
              />
              <MenuButton
                label="Edit"
                onClick={() => {
                  setMenu(null);
                  router.push(`/supermarket/promotions/${menuItem.id}/edit`);
                }}
              />
              {menuStatus === "ACTIVE" ? (
                <MenuButton
                  label="Deactivate"
                  onClick={() => {
                    setMenu(null);
                    setConfirm({ type: "deactivate", id: menuItem.id });
                  }}
                />
              ) : null}
              {menuStatus === "SCHEDULED" ? (
                <MenuButton
                  label="Cancel"
                  onClick={() => {
                    setMenu(null);
                    setConfirm({ type: "cancel", id: menuItem.id });
                  }}
                />
              ) : null}
              {menuStatus === "INACTIVE" ? (
                <MenuButton
                  label="Activate"
                  onClick={() => {
                    setMenu(null);
                    setConfirm({ type: "activate", id: menuItem.id });
                  }}
                />
              ) : null}
              <MenuButton
                label="Duplicate"
                onClick={() => {
                  setMenu(null);
                  const copy = duplicatePromotion(menuItem.id);
                  if (copy) router.push(`/supermarket/promotions/${copy.id}/edit`);
                }}
              />
              <MenuButton
                label="Delete"
                onClick={() => {
                  setMenu(null);
                  setConfirm({ type: "delete", id: menuItem.id });
                }}
              />
            </div>,
            document.body,
          )
        : null}

      <PromotionConfirmDialog
        open={confirm?.type === "delete"}
        title="Delete Promotion?"
        message="Are you sure you want to delete this promotion? This action cannot be undone."
        confirmLabel="Delete Promotion"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.type === "delete") deletePromotion(confirm.id);
          setConfirm(null);
        }}
      />
      <PromotionConfirmDialog
        open={confirm?.type === "deactivate"}
        title="Deactivate Promotion?"
        message="This promotion will stop applying until activated again."
        confirmLabel="Deactivate"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.type === "deactivate") setPromotionStatus(confirm.id, "INACTIVE");
          setConfirm(null);
        }}
      />
      <PromotionConfirmDialog
        open={confirm?.type === "cancel"}
        title="Cancel Scheduled Promotion?"
        message="This scheduled promotion will be deactivated and will not start automatically."
        confirmLabel="Cancel Promotion"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.type === "cancel") setPromotionStatus(confirm.id, "INACTIVE");
          setConfirm(null);
        }}
      />
      <PromotionConfirmDialog
        open={confirm?.type === "activate"}
        title="Activate Promotion?"
        message="This promotion will become available again according to its validity dates."
        confirmLabel="Activate"
        tone="default"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.type === "activate") setPromotionStatus(confirm.id, "ACTIVE");
          setConfirm(null);
        }}
      />
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  accent,
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={cn(glassCard, "relative overflow-hidden px-4 py-4", accent && "border-emerald-200/40 bg-[#eefaf2]/70")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-slate-500">{title}</p>
          <p className="mt-1.5 text-[28px] font-semibold tracking-[-0.04em] text-navy">{value}</p>
          <p className="mt-1 text-[12px] text-slate-400">{subtitle}</p>
        </div>
        <span
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/80 text-slate-500 shadow-[0_6px_14px_rgba(15,35,64,0.06)]",
            accent && "border-emerald-200/50 text-emerald-600",
          )}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full px-3.5 py-2.5 text-left text-[13px] text-navy transition hover:bg-navy/[0.04]"
    >
      {label}
    </button>
  );
}
