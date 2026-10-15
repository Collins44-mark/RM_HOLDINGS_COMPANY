import type { RiceItemKind } from "@/lib/rice/types";

export const RICE_WAREHOUSE_KIND_SLUGS = ["paddy", "rice", "broken", "by-products"] as const;
export type RiceWarehouseKindSlug = (typeof RICE_WAREHOUSE_KIND_SLUGS)[number];

const SLUG_TO_KIND: Record<RiceWarehouseKindSlug, RiceItemKind> = {
  paddy: "PADDY",
  rice: "RICE",
  broken: "BROKEN",
  "by-products": "BYPRODUCT",
};

const KIND_TO_SLUG: Record<RiceItemKind, RiceWarehouseKindSlug> = {
  PADDY: "paddy",
  RICE: "rice",
  BROKEN: "broken",
  BYPRODUCT: "by-products",
};

export function parseRiceWarehouseKind(value: string | undefined): RiceItemKind | null {
  if (!value) return null;
  return value in SLUG_TO_KIND ? SLUG_TO_KIND[value as RiceWarehouseKindSlug] : null;
}

export function riceWarehouseKindSlug(kind: RiceItemKind): RiceWarehouseKindSlug {
  return KIND_TO_SLUG[kind];
}

export const RICE_WAREHOUSE_KIND_ORDER: RiceItemKind[] = ["PADDY", "RICE", "BROKEN", "BYPRODUCT"];
