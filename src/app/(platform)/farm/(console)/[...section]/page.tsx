import { redirect } from "next/navigation";
import { ModuleSection } from "@/components/modules/ModuleSection";

const LEGACY: Record<string, string> = {
  plots: "/farm/operations",
  seasons: "/farm/operations",
  harvests: "/farm/operations",
};

export default async function FarmSectionRoute({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  if (section.length === 1 && LEGACY[section[0]]) redirect(LEGACY[section[0]]);
  return <ModuleSection module="farm" section={section} />;
}
