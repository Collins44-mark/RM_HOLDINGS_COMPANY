import { getSchoolClassDetailAction } from "@/actions/school/classes";
import { SchoolClassDetailPage } from "@/components/school/SchoolClassDetailPage";

export const metadata = { title: "Classes" };

export default async function SchoolClassDetailRoute({
  params,
}: {
  params: Promise<{ levelId: string; classId: string }>;
}) {
  const { levelId, classId } = await params;
  const result = await getSchoolClassDetailAction(levelId, classId);
  return (
    <SchoolClassDetailPage
      level={result.ok ? result.level : null}
      classRow={result.ok ? result.classRow : null}
      streams={result.ok ? result.streams : []}
      canManage={result.ok ? result.capabilities.canManage : false}
      error={result.ok ? null : result.error}
    />
  );
}
