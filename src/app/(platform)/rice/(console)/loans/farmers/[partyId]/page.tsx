import { loadFarmerHistoryAction, loadLoanWorkspaceAction } from "@/actions/rice/loans";
import { RiceFarmerProfilePage } from "@/components/rice/RiceFarmerProfilePage";
import { isPracticeLoanParty } from "@/lib/rice/loan-model";

export const dynamic = "force-dynamic";
export const metadata = { title: "Farmer" };

export default async function RiceFarmerProfileRoute({ params }: { params: Promise<{ partyId: string }> }) {
  const { partyId } = await params;
  const [workspaceResult, historyResult] = await Promise.all([
    loadLoanWorkspaceAction(),
    loadFarmerHistoryAction(partyId),
  ]);
  if (!workspaceResult.ok) return <RiceFarmerProfilePage initial={{ ok: false, error: workspaceResult.error }} />;
  if (isPracticeLoanParty(partyId)) return <RiceFarmerProfilePage initial={{ ok: false, error: "Farmer was not found." }} />;
  const farmer = workspaceResult.workspace.farmers.find((row) => row.id === partyId);
  if (!farmer) return <RiceFarmerProfilePage initial={{ ok: false, error: "Farmer was not found." }} />;
  if (!historyResult.ok) return <RiceFarmerProfilePage initial={{ ok: false, error: historyResult.error }} />;
  return (
    <RiceFarmerProfilePage
      initial={{
        ok: true,
        profile: {
          farmer,
          loans: workspaceResult.workspace.loans.filter((row) => row.partyId === partyId),
          history: { repayments: historyResult.repayments, disbursements: historyResult.disbursements },
          canEdit: workspaceResult.workspace.caps.canApply,
          canRepay: workspaceResult.workspace.caps.canRepay,
        },
      }}
    />
  );
}
