"use client";

import { useEffect, useRef, useState } from "react";
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
  const [completedKey, setCompletedKey] = useState<string | null>(null);

  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  const rangeFrom = range.from;
  const rangeTo = range.to;
  const filtersKey = JSON.stringify(filters ?? {});
  const requestKey = `${preset}|${rangeFrom}|${rangeTo}|${filtersKey}`;
  const loading = completedKey !== requestKey;

  useEffect(() => {
    let active = true;
    const requestRange = { from: rangeFrom, to: rangeTo };
    const requestFilters = JSON.parse(filtersKey) as TFilters;

    void loaderRef
      .current(preset, requestRange, requestFilters)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(result.error);
          setData(null);
        } else {
          setError(null);
          setData(result.data);
        }
        setCompletedKey(requestKey);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load report.");
        setData(null);
        setCompletedKey(requestKey);
      });

    return () => {
      active = false;
    };
  }, [preset, rangeFrom, rangeTo, filtersKey, requestKey]);

  return {
    data: loading ? null : data,
    error: loading ? null : error,
    loading,
  };
}
