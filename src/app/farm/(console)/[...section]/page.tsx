import { ModuleSection } from "@/components/modules/ModuleSection";

export default async function FarmSectionRoute({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  return <ModuleSection module="farm" section={section} />;
}
