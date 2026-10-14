"use client";

import { SCHOOL_PAGE_SIZE, SCHOOL_PAGE_SIZES } from "@/lib/school/pagination";
import { PaginationBar } from "@/components/ui/PaginationBar";

export function replaceSchoolPageParam(
  page: number,
  pageSize?: number,
  extra?: { status?: string; q?: string; levelId?: string; classId?: string; streamId?: string },
) {
  const url = new URL(window.location.href);
  if (page <= 1) url.searchParams.delete("page");
  else url.searchParams.set("page", String(page));
  if (pageSize && pageSize !== SCHOOL_PAGE_SIZE) url.searchParams.set("pageSize", String(pageSize));
  else if (pageSize === SCHOOL_PAGE_SIZE) url.searchParams.delete("pageSize");
  if (extra) {
    if ("status" in extra) {
      if (extra.status && extra.status !== "all") url.searchParams.set("status", extra.status);
      else url.searchParams.delete("status");
    }
    if ("q" in extra) {
      if (extra.q) url.searchParams.set("q", extra.q);
      else url.searchParams.delete("q");
    }
    if ("levelId" in extra) {
      if (extra.levelId) url.searchParams.set("levelId", extra.levelId);
      else url.searchParams.delete("levelId");
    }
    if ("classId" in extra) {
      if (extra.classId) url.searchParams.set("classId", extra.classId);
      else url.searchParams.delete("classId");
    }
    if ("streamId" in extra) {
      if (extra.streamId) url.searchParams.set("streamId", extra.streamId);
      else url.searchParams.delete("streamId");
    }
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

export function SchoolPagination({
  page,
  total,
  pageSize = SCHOOL_PAGE_SIZE,
  pendingPageSize = null,
  onPage,
  onPageSize,
}: {
  page: number;
  total: number;
  pageSize?: number;
  pendingPageSize?: number | null;
  onPage: (page: number) => void;
  onPageSize?: (pageSize: number) => void;
}) {
  return (
    <PaginationBar
      page={page}
      total={total}
      pageSize={pageSize}
      sizes={SCHOOL_PAGE_SIZES}
      pendingPageSize={pendingPageSize}
      onPage={onPage}
      onPageSize={onPageSize}
    />
  );
}
