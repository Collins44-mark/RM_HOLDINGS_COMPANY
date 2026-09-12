import { ModuleSection } from "@/components/modules/ModuleSection";

export default async function RiceSectionRoute({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  return <ModuleSection module="rice" section={section} />;
}
