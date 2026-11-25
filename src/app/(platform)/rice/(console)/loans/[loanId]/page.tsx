import { loadLoanDetailAction } from "@/actions/rice/loans";
import { RiceLoanDetailPage } from "@/components/rice/RiceLoanDetailPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Loan" };

export default async function RiceLoanDetailRoute({ params }: { params: Promise<{ loanId: string }> }) {
  const { loanId } = await params;
  const initial = await loadLoanDetailAction(loanId);
  return <RiceLoanDetailPage initial={initial} />;
}
