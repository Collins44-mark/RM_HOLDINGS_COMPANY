import { getSchoolSubjectsWorkspaceAction } from "@/actions/school/subjects";
import { SchoolSubjectsPage } from "@/components/school/SchoolSubjectsPage";

export const metadata = { title: "Subjects" };
export const dynamic = "force-dynamic";

export default async function SchoolSubjectsRoute() {
  const result = await getSchoolSubjectsWorkspaceAction();
  return (
    <SchoolSubjectsPage workspace={result.ok ? result.workspace : null} error={result.ok ? null : result.error} />
  );
}
