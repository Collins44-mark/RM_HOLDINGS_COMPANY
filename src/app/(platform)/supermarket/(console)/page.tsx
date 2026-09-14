import { SupermarketDashboard } from "@/components/supermarket/SupermarketDashboard";
import { SUPERMARKET_SAMPLE } from "@/lib/data/sample-supermarket";

export const metadata = { title: "Supermarket" };

export default function SupermarketHomePage() {
  return <SupermarketDashboard data={SUPERMARKET_SAMPLE} />;
}
