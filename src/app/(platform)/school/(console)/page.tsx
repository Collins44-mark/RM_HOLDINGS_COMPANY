import { getSchoolOverviewAction } from "@/actions/school/overview";
import { SchoolOverviewPage } from "@/components/school/SchoolOverviewPage";

export const metadata = { title: "School Overview" };
export const dynamic = "force-dynamic";

export default async function SchoolHomePage() {
  const result = await getSchoolOverviewAction();
  return (
    <SchoolOverviewPage
      overview={result.ok ? result.overview : null}
      error={result.ok ? null : result.error}
    />
  );
}
