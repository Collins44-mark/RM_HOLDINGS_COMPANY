import { loadSchoolEmergencyFundAction } from "@/actions/school/expenses";
import { SchoolEmergencyFundPage } from "@/components/school/SchoolEmergencyFundPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Emergency Fund" };

export default async function SchoolEmergencyFundRoute() {
  const initial = await loadSchoolEmergencyFundAction({ period: "this-month" });
  return <SchoolEmergencyFundPage initial={initial} />;
}
