export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZES = [10, 20, 50] as const;

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  from: number;
  to: number;
  totalPages: number;
};

export function parsePage(value: unknown) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

export function parsePageSize(value: unknown, fallback = DEFAULT_PAGE_SIZE, sizes: readonly number[] = PAGE_SIZES) {
  const n = Number(value);
  if (sizes.includes(n)) return n;
  return fallback;
}

export function pageRange(page: number, pageSize = DEFAULT_PAGE_SIZE) {
  const nextPage = parsePage(page);
  const from = (nextPage - 1) * pageSize;
  return { page: nextPage, from, to: from + pageSize - 1, pageSize };
}

export function pageMeta(page: number, total: number, pageSize = DEFAULT_PAGE_SIZE): PageMeta {
  const safeTotal = Math.max(0, total);
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize) || 1);
  const nextPage = Math.min(parsePage(page), totalPages);
  const from = safeTotal === 0 ? 0 : (nextPage - 1) * pageSize + 1;
  const to = Math.min(nextPage * pageSize, safeTotal);
  return { page: nextPage, pageSize, total: safeTotal, from, to, totalPages };
}

export const EMPTY_PAGE = pageMeta(1, 0);
