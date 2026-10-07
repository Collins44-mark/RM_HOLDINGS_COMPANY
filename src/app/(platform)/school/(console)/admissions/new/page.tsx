import { getAdmissionFormOptionsAction } from "@/actions/school/admissions";
import { SchoolAdmissionFormPage } from "@/components/school/SchoolAdmissionFormPage";

export const metadata = { title: "New Admission" };

export default async function SchoolNewAdmissionRoute() {
  const options = await getAdmissionFormOptionsAction("manage");
  return (
    <SchoolAdmissionFormPage
      options={options.ok ? options : null}
      admission={null}
      error={options.ok ? null : options.error}
    />
  );
}
