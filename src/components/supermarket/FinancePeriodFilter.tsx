"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SalesDateRange, SalesPeriodPreset } from "@/lib/data/sample-supermarket-sales";
import { filterClass } from "@/components/supermarket/purchasing-ui";

const PERIOD_OPTIONS: { id: Exclude<SalesPeriodPreset, "range">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
];

export function FinancePeriodFilter({
  preset,
  label,
  range,
  onPreset,
  onRange,
  ariaLabel = "Period",
}: {
  preset: SalesPeriodPreset;
  label: string;
  range: SalesDateRange;
  onPreset: (preset: SalesPeriodPreset) => void;
  onRange: (range: SalesDateRange) => void;
  ariaLabel?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0, width: 240 });
  const [draft, setDraft] = useState<SalesDateRange>(range);

  useEffect(() => {
    setMounted(true);
  }, []);

  function placeMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(240, rect.width);
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    setMenuCoords({
      top: rect.bottom + 6,
      left: Math.max(8, left),
      width,
    });
  }

  useEffect(() => {
    if (!menuOpen && !rangeOpen) return;
    placeMenu();
    function onReposition() {
      placeMenu();
    }
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [menuOpen, rangeOpen]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setRangeOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openMenu() {
    placeMenu();
    setRangeOpen(false);
    setMenuOpen((open) => !open);
  }

  function selectPreset(next: Exclude<SalesPeriodPreset, "range">) {
    onPreset(next);
    setMenuOpen(false);
    setRangeOpen(false);
  }

  function openRange() {
    setDraft(range);
    setMenuOpen(false);
    placeMenu();
    setRangeOpen(true);
  }

  function applyRange() {
    if (!draft.from || !draft.to) return;
    const from = draft.from <= draft.to ? draft.from : draft.to;
    const to = draft.from <= draft.to ? draft.to : draft.from;
    onRange({ from, to });
    onPreset("range");
    setRangeOpen(false);
  }

  const panelOpen = menuOpen || rangeOpen;

  return (
    <div className="relative w-full min-w-0 sm:w-auto sm:min-w-[11.5rem]">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={panelOpen}
        onClick={openMenu}
        className={cn(filterClass, "inline-flex w-full items-center justify-between gap-2 pr-3 text-left sm:w-auto")}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={1.9} />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-slate-400 transition duration-200", panelOpen && "rotate-180")}
          strokeWidth={2}
        />
      </button>
      {mounted && panelOpen
        ? createPortal(
            <>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                className="fixed inset-0 z-[79] cursor-default bg-transparent"
                onClick={() => {
                  setMenuOpen(false);
                  setRangeOpen(false);
                }}
              />
              {menuOpen ? (
                <div
                  className="fixed z-[80] origin-top-left overflow-hidden rounded-[16px] border border-white/80 bg-white/92 py-1 shadow-[0_18px_50px_rgba(16,24,40,0.14)] backdrop-blur-xl"
                  style={{ top: menuCoords.top, left: menuCoords.left, width: menuCoords.width }}
                  role="listbox"
                  aria-label={ariaLabel}
                >
                  {PERIOD_OPTIONS.map((option) => {
                    const selected = preset === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => selectPreset(option.id)}
                        className={cn(
                          "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13px] text-navy transition hover:bg-navy/[0.04]",
                          selected && "bg-navy/[0.05] font-medium",
                        )}
                      >
                        {option.label}
                        {selected ? <Check className="h-3.5 w-3.5 text-navy" strokeWidth={2.4} /> : <span className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                  <div className="mx-3 my-1 h-px bg-[#d5dee8]/80" />
                  <button
                    type="button"
                    onClick={openRange}
                    className={cn(
                      "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13px] text-navy transition hover:bg-navy/[0.04]",
                      preset === "range" && "bg-navy/[0.05] font-medium",
                    )}
                  >
                    <span>Custom Range</span>
                    {preset === "range" ? <Check className="h-3.5 w-3.5 text-navy" strokeWidth={2.4} /> : null}
                  </button>
                </div>
              ) : null}
              {rangeOpen ? (
                <div
                  className="fixed z-[80] w-[min(22rem,calc(100vw-16px))] overflow-hidden rounded-[20px] border border-white/80 bg-white/94 p-4 shadow-[0_18px_50px_rgba(16,24,40,0.16)] backdrop-blur-xl"
                  style={{ top: menuCoords.top, left: menuCoords.left }}
                >
                  <p className="text-[13px] font-semibold tracking-[-0.02em] text-navy">Custom Range</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-slate-500">From</span>
                      <input
                        type="date"
                        value={draft.from}
                        onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
                        className={cn(filterClass, "rounded-[14px] px-3")}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-slate-500">To</span>
                      <input
                        type="date"
                        value={draft.to}
                        onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
                        className={cn(filterClass, "rounded-[14px] px-3")}
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setRangeOpen(false)}
                      className="h-9 rounded-full px-3.5 text-[13px] font-medium text-slate-500 transition hover:bg-navy/[0.04] hover:text-navy"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={applyRange}
                      className="inline-flex h-9 items-center rounded-full bg-[#0b2244] px-4 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(11,34,68,0.18)]"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ) : null}
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
