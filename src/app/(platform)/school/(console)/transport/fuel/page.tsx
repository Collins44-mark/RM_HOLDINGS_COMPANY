import { redirect } from "next/navigation";

export default function SchoolTransportFuelRedirect() {
  redirect("/school/transport/service?tab=fuel");
}
