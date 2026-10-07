import { getSchoolLevelsAction } from "@/actions/school/classes";
import { SchoolClassesPage } from "@/components/school/SchoolClassesPage";
import { parseSchoolPage, schoolPageMeta } from "@/lib/school/pagination";

export const metadata = { title: "Classes" };

export default async function SchoolClassesRoute({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const result = await getSchoolLevelsAction({ page: parseSchoolPage(params.page) });
  return (
    <SchoolClassesPage
      levels={result.ok ? result.levels : []}
      page={result.ok ? result.page : schoolPageMeta(1, 0)}
      canManage={result.ok ? result.capabilities.canManage : false}
      error={result.ok ? null : result.error}
    />
  );
}
