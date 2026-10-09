import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SchoolExamsRedirect() {
  redirect("/school/exams-results");
}
