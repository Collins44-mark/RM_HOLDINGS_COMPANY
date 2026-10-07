import { getSchoolLevelDetailAction } from "@/actions/school/classes";
import { SchoolLevelDetailPage } from "@/components/school/SchoolLevelDetailPage";
import { parseSchoolPage, schoolPageMeta } from "@/lib/school/pagination";

export const metadata = { title: "Classes" };

export default async function SchoolLevelDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ levelId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { levelId } = await params;
  const query = await searchParams;
  const result = await getSchoolLevelDetailAction(levelId, { page: parseSchoolPage(query.page) });
  return (
    <SchoolLevelDetailPage
      level={result.ok ? result.level : null}
      classes={result.ok ? result.classes : []}
      page={result.ok ? result.page : schoolPageMeta(1, 0)}
      canManage={result.ok ? result.capabilities.canManage : false}
      error={result.ok ? null : result.error}
    />
  );
}
