"use client";

import { useEffect, useState } from "react";
import type { SalesDateRange, SalesPeriodPreset } from "@/lib/data/sample-supermarket-sales";

export function useLiveReport<TData, TFilters>(
  loader: (
    preset: SalesPeriodPreset,
    range: SalesDateRange,
    filters: TFilters,
  ) => Promise<{ ok: true; data: TData } | { ok: false; error: string }>,
  preset: SalesPeriodPreset,
  range: SalesDateRange,
  filters: TFilters,
) {
  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loader(preset, range, filters).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setData(null);
      } else {
        setError(null);
        setData(result.data);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [loader, preset, range, filters]);

  return { data, error, loading };
}
