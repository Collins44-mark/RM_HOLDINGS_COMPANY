import { listBeekeepingDirectory } from "@/lib/beekeeping/directory";
import SalesView from "./sales-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales & Expenses" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  return <SalesView initial={await listBeekeepingDirectory()} initialTab={params.tab === "expenses" ? "expenses" : "sales"} />;
}
