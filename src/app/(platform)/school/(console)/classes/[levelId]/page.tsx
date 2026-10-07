import { getSchoolLevelDetailAction } from "@/actions/school/classes";
import { SchoolLevelDetailPage } from "@/components/school/SchoolLevelDetailPage";

export const metadata = { title: "Classes" };

export default async function SchoolLevelDetailRoute({
  params,
}: {
  params: Promise<{ levelId: string }>;
}) {
  const { levelId } = await params;
  const result = await getSchoolLevelDetailAction(levelId);
  return (
    <SchoolLevelDetailPage
      level={result.ok ? result.level : null}
      classes={result.ok ? result.classes : []}
      canManage={result.ok ? result.capabilities.canManage : false}
      error={result.ok ? null : result.error}
    />
  );
}
