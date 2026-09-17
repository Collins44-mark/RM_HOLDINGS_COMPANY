import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function FinanceBackLink() {
  return (
    <Link
      href="/supermarket/finance"
      className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500 transition hover:text-navy"
    >
      <ArrowLeft className="h-4 w-4" /> Back to Finance
    </Link>
  );
}
