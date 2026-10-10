import { loadSchoolSalaryWorkspaceAction } from "@/actions/school/salary";
import { SchoolSalaryPage } from "@/components/school/SchoolSalaryPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Salaries" };

export default async function SupermarketSalariesRoute() {
  const initial = await loadSchoolSalaryWorkspaceAction({
    period: "this-month",
    status: "active",
    lockedUnitCode: "supermarket",
  });
  return <SchoolSalaryPage initial={initial} lockedUnitCode="supermarket" />;
}
