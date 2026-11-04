"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PAGE_SIZE, pageMeta, parsePageSize } from "@/lib/pagination";

export function useListPage<T>(rows: T[], resetKey: string) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const meta = pageMeta(page, rows.length, pageSize);
  const start = rows.length === 0 ? 0 : (meta.page - 1) * pageSize;
  return {
    page: meta.page,
    pageSize,
    setPage,
    setPageSize: (size: number) => {
      setPageSize(parsePageSize(size));
      setPage(1);
    },
    rows: rows.slice(start, start + pageSize),
  };
}
