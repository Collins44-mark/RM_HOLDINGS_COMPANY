import { getSchoolExamsWorkspaceAction } from "@/actions/school/exams";
import { SchoolExamsPage } from "@/components/school/SchoolExamsPage";

export const metadata = { title: "Exams & Results" };
export const dynamic = "force-dynamic";

export default async function SchoolExamsResultsRoute() {
  const result = await getSchoolExamsWorkspaceAction();
  return <SchoolExamsPage workspace={result.ok ? result.workspace : null} error={result.ok ? null : result.error} />;
}
