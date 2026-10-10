import { ModuleSection } from "@/components/modules/ModuleSection";
import { ModuleSectionPage } from "@/components/ui/PageHeader";

const LEGACY_SECTIONS: Record<string, { title: string; description: string }> = {
  farmers: {
    title: "Farmers",
    description: "Farmer records for Rice Mill & Warehouse remaining on this route until the purchases workspace is implemented.",
  },
  stock: {
    title: "Stock",
    description: "Stock remains available at this route. Company-owned inventory and customer storage will be recorded separately when the warehouse ledger is implemented.",
  },
  grading: {
    title: "Grading",
    description: "Grading remains available at this route until milling & production records are implemented.",
  },
  payments: {
    title: "Payments",
    description: "Payments remain available at this route until the rice finance workspace is implemented.",
  },
};

export default async function RiceSectionRoute({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  if (section.length === 1 && LEGACY_SECTIONS[section[0]]) {
    const page = LEGACY_SECTIONS[section[0]];
    return <ModuleSectionPage title={page.title} description={page.description} />;
  }
  return <ModuleSection module="rice" section={section} />;
}
