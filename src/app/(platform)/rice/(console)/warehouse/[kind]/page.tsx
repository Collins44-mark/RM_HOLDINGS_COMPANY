import { notFound } from "next/navigation";
import { loadRiceWarehouseKindWorkspaceAction } from "@/actions/rice/workspace";
import { RiceWarehouseKindPage } from "@/components/rice/RiceWarehouseKindPage";
import { parseRiceWarehouseKind, type RiceWarehouseKindSlug } from "@/lib/rice/warehouse-kind";

export const dynamic = "force-dynamic";
export const metadata = { title: "Warehouse" };

export default async function RiceWarehouseKindRoute({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  if (!parseRiceWarehouseKind(kind)) notFound();
  const initial = await loadRiceWarehouseKindWorkspaceAction({ kind });
  return <RiceWarehouseKindPage slug={kind as RiceWarehouseKindSlug} initial={initial} />;
}
