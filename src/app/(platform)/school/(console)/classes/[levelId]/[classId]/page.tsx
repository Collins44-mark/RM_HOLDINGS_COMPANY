import { getSchoolClassDetailAction } from "@/actions/school/classes";
import { SchoolClassDetailPage } from "@/components/school/SchoolClassDetailPage";
import { parseSchoolPage, schoolPageMeta } from "@/lib/school/pagination";

export const metadata = { title: "Classes" };

export default async function SchoolClassDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ levelId: string; classId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { levelId, classId } = await params;
  const query = await searchParams;
  const result = await getSchoolClassDetailAction(levelId, classId, { page: parseSchoolPage(query.page) });
  return (
    <SchoolClassDetailPage
      level={result.ok ? result.level : null}
      classRow={result.ok ? result.classRow : null}
      streams={result.ok ? result.streams : []}
      page={result.ok ? result.page : schoolPageMeta(1, 0)}
      canManage={result.ok ? result.capabilities.canManage : false}
      error={result.ok ? null : result.error}
    />
  );
}
