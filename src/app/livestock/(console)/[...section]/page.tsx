import { ModuleSection } from "@/components/modules/ModuleSection";

export default async function LivestockSectionRoute({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  return <ModuleSection module="livestock" section={section} />;
}
