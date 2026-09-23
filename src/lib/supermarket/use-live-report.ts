"use client";

import { useEffect, useRef, useState } from "react";
import type { SalesDateRange, SalesPeriodPreset } from "@/lib/data/sample-supermarket-sales";

type LiveReportState<TData> = {
  /** Request key that produced the current data/error (null = never resolved). */
  resolvedKey: string | null;
  data: TData | null;
  error: string | null;
};

/**
 * Shared live-report loader for Sales / Purchases / Inventory / P&L.
 *
 * Root cause of permanent "Loading … report…":
 * Effect cleanups set a `cancelled` flag that discarded in-flight responses whenever
 * React Strict Mode or a parent remount re-ran the effect with the SAME request key.
 * The next request was often cancelled again before settle → loading never ended.
 *
 * Fix: never cancel same-key responses. Ignore results only when the request key
 * has actually changed (stale response for an older period/filters).
 */
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
  const [state, setState] = useState<LiveReportState<TData>>({
    resolvedKey: null,
    data: null,
    error: null,
  });

  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  const rangeFrom = range.from;
  const rangeTo = range.to;
  const filtersKey = stableFiltersKey(filters);
  const requestKey = `${preset}|${rangeFrom}|${rangeTo}|${filtersKey}`;
  const latestKeyRef = useRef(requestKey);

  const loading = state.resolvedKey !== requestKey;

  useEffect(() => {
    const key = `${preset}|${rangeFrom}|${rangeTo}|${filtersKey}`;
    latestKeyRef.current = key;
    const requestRange: SalesDateRange = { from: rangeFrom, to: rangeTo };
    const requestFilters = JSON.parse(filtersKey) as TFilters;

    void Promise.resolve()
      .then(() => loaderRef.current(preset, requestRange, requestFilters))
      .then((result) => {
        // Ignore only if the user has moved on to a different period/filters.
        if (latestKeyRef.current !== key) return;
        if (!result.ok) {
          setState({
            resolvedKey: key,
            data: null,
            error: result.error || "Unable to load report.",
          });
          return;
        }
        setState({
          resolvedKey: key,
          data: result.data,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (latestKeyRef.current !== key) return;
        if (isNextControlFlowError(err)) throw err;
        setState({
          resolvedKey: key,
          data: null,
          error: err instanceof Error ? err.message : "Unable to load report.",
        });
      });
  }, [preset, rangeFrom, rangeTo, filtersKey]);

  return {
    data: state.resolvedKey === requestKey ? state.data : null,
    error: state.resolvedKey === requestKey ? state.error : null,
    loading,
  };
}

function stableFiltersKey(filters: unknown) {
  if (filters == null) return "{}";
  if (typeof filters !== "object") return JSON.stringify(filters);
  const record = filters as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) normalized[key] = record[key];
  return JSON.stringify(normalized);
}

function isNextControlFlowError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const digest = "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND");
}
