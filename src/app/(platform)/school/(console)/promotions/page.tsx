import { loadSchoolPromotionYearsAction } from "@/actions/school/lifecycle";
import { SchoolPromotionsPage } from "@/components/school/SchoolPromotionsPage";

export const metadata = { title: "Promotions & Academic Progression" };
export const dynamic = "force-dynamic";

export default async function SchoolPromotionsRoute() {
  const result = await loadSchoolPromotionYearsAction();
  return (
    <SchoolPromotionsPage
      years={result.years}
      today={result.ok ? result.today : new Date().toISOString().slice(0, 10)}
      canManage={result.ok ? result.canManage : false}
      error={result.ok ? null : result.error}
    />
  );
}
