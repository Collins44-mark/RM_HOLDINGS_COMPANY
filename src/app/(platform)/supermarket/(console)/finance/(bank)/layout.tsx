import { getBankMovementsWorkspaceAction } from "@/actions/supermarket/banking";
import { getBankWorkspaceAction } from "@/actions/supermarket/reconciliation";
import { BankingWorkspace } from "@/components/supermarket/reconciliation/BankingWorkspace";
import { todayInDarEsSalaam } from "@/lib/supermarket/reconciliation";

export default async function BankWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const asOf = todayInDarEsSalaam();
  const [initialMovements, initialRecon] = await Promise.all([
    getBankMovementsWorkspaceAction({ from: asOf, to: asOf }),
    getBankWorkspaceAction({ from: asOf, to: asOf }),
  ]);
  return (
    <>
      <BankingWorkspace asOf={asOf} initialMovements={initialMovements} initialRecon={initialRecon} />
      <div className="hidden">{children}</div>
    </>
  );
}
