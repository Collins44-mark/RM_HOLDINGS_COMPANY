import { loadSchoolSalaryWorkspaceAction } from "@/actions/school/salary";
import { SchoolSalaryPage } from "@/components/school/SchoolSalaryPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Salaries" };

export default async function SchoolSalariesRoute() {
  const initial = await loadSchoolSalaryWorkspaceAction({ period: "this-month", status: "active", lockedUnitCode: "school" });
  return <SchoolSalaryPage initial={initial} lockedUnitCode="school" />;
}
