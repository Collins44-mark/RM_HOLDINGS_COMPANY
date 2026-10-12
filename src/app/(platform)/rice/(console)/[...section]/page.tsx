import { ModuleSection } from "@/components/modules/ModuleSection";
import { ModuleSectionPage } from "@/components/ui/PageHeader";

const LEGACY_SECTIONS: Record<string, { title: string; description: string }> = {
  farmers: {
    title: "Farmers",
    description: "Supplier and farmer records are now posted from Purchases.",
  },
  stock: {
    title: "Stock",
    description: "Company-owned stock is now on Warehouse. Customer-owned paddy is on Customer Storage.",
  },
  grading: {
    title: "Grading",
    description: "Grading and milling output are recorded on Milling & Production.",
  },
  payments: {
    title: "Payments",
    description: "Purchase and sale payments are recorded on Purchases, Sales & Dispatch, and Finance.",
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
