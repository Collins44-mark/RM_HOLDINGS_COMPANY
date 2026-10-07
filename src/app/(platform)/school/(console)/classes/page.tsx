import { getSchoolLevelsAction } from "@/actions/school/classes";
import { SchoolClassesPage } from "@/components/school/SchoolClassesPage";

export const metadata = { title: "Classes" };

export default async function SchoolClassesRoute() {
  const result = await getSchoolLevelsAction();
  return (
    <SchoolClassesPage
      levels={result.ok ? result.levels : []}
      canManage={result.ok ? result.capabilities.canManage : false}
      error={result.ok ? null : result.error}
    />
  );
}
