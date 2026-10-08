import { redirect } from "next/navigation";

export default function SchoolTransportMaintenanceRedirect() {
  redirect("/school/transport/service?tab=maintenance");
}
