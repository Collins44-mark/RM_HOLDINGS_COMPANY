export const SCHOOL_PAGE_SIZE = 20;

export type SchoolPageMeta = {
  page: number;
  pageSize: number;
  total: number;
  from: number;
  to: number;
  totalPages: number;
};

export type SchoolListFilter = "active" | "archived" | "all";

export function parseSchoolPage(value: unknown) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

export function schoolPageRange(page: number, pageSize = SCHOOL_PAGE_SIZE) {
  const nextPage = parseSchoolPage(page);
  const from = (nextPage - 1) * pageSize;
  return { page: nextPage, from, to: from + pageSize - 1, pageSize };
}

export function schoolPageMeta(page: number, total: number, pageSize = SCHOOL_PAGE_SIZE): SchoolPageMeta {
  const safeTotal = Math.max(0, total);
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize) || 1);
  const nextPage = Math.min(parseSchoolPage(page), totalPages);
  const from = safeTotal === 0 ? 0 : (nextPage - 1) * pageSize + 1;
  const to = Math.min(nextPage * pageSize, safeTotal);
  return { page: nextPage, pageSize, total: safeTotal, from, to, totalPages };
}

export function applyActiveFilter<T extends { eq: (column: string, value: boolean) => T }>(query: T, filter: SchoolListFilter) {
  if (filter === "active") return query.eq("is_active", true);
  if (filter === "archived") return query.eq("is_active", false);
  return query;
}
