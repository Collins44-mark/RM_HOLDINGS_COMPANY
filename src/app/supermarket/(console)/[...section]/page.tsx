import { ModuleSection } from "@/components/modules/ModuleSection";

export default async function SupermarketSectionRoute({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  return <ModuleSection module="supermarket" section={section} />;
}
