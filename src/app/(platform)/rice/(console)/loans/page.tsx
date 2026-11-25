import { loadLoanWorkspaceAction } from "@/actions/rice/loans";
import { RiceLoansPage, type LoanTab } from "@/components/rice/RiceLoansPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Farmer Loans" };

export default async function RiceLoansRoute({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab: LoanTab =
    params.tab === "farmers" || params.tab === "applications" || params.tab === "loans" ? params.tab : "overview";
  const initial = await loadLoanWorkspaceAction();
  return <RiceLoansPage initial={initial} tab={tab} />;
}
