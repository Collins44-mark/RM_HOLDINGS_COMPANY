import { BankingWorkspace } from "@/components/supermarket/reconciliation/BankingWorkspace";

export default function BankWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BankingWorkspace />
      <div className="hidden">{children}</div>
    </>
  );
}
