import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function StaffEditLoading() {
  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <Link href="/school/staff" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-navy">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Staff
      </Link>
      <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Edit Staff</h1>
      <p className="text-[13.5px] text-slate-500">Loading this employee.</p>
    </div>
  );
}
