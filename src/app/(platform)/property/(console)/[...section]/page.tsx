import { ModuleSection } from "@/components/modules/ModuleSection";

export default async function PropertySectionRoute({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  return <ModuleSection module="property" section={section} />;
}
