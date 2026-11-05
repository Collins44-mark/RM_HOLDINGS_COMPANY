import { getSchoolFeeAccountAction } from "@/actions/school/fees";
import { getStudentTransportWorkspaceAction } from "@/actions/school/transport-billing";
import { SchoolStudentFeeProfilePage } from "@/components/school/SchoolStudentFeeProfilePage";

export const metadata = { title: "Student fees" };
export const dynamic = "force-dynamic";

export default async function SchoolStudentFeeProfileRoute({
  params,
  searchParams,
}: {
  params: Promise<{ enrollmentId: string }>;
  searchParams: Promise<{ pay?: string }>;
}) {
  const [{ enrollmentId }, query] = await Promise.all([params, searchParams]);
  const [result, transport] = await Promise.all([
    getSchoolFeeAccountAction(enrollmentId),
    getStudentTransportWorkspaceAction({ enrollmentId }),
  ]);
  return (
    <SchoolStudentFeeProfilePage
      account={result.ok ? result.account : null}
      capabilities={result.ok ? result.capabilities : null}
      error={result.ok ? null : result.error}
      openPay={query.pay === "1"}
      transport={transport.ok ? transport.workspace : null}
    />
  );
}
