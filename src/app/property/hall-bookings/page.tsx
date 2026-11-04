import HallBookingsView from "./hall-bookings-view";
import { listHallDirectory } from "@/lib/property/hall-directory";

export const dynamic = "force-dynamic";

export default async function HallBookingsPage() {
  const directory = await listHallDirectory();
  return <HallBookingsView initialItems={directory.bookings} halls={directory.halls} customers={directory.customers} />;
}
