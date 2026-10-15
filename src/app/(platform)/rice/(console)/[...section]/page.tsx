import { ModuleSection } from "@/components/modules/ModuleSection";
import { ModuleSectionPage } from "@/components/ui/PageHeader";
import type { MessageKey } from "@/lib/i18n";
import { getTranslator } from "@/lib/i18n/server";

const LEGACY_SECTIONS: Record<string, { title: MessageKey; description: MessageKey }> = {
  farmers: { title: "rice.legacy.farmers.title", description: "rice.legacy.farmers.desc" },
  stock: { title: "rice.legacy.stock.title", description: "rice.legacy.stock.desc" },
  grading: { title: "rice.legacy.grading.title", description: "rice.legacy.grading.desc" },
  payments: { title: "rice.legacy.payments.title", description: "rice.legacy.payments.desc" },
};

export default async function RiceSectionRoute({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  if (section.length === 1 && LEGACY_SECTIONS[section[0]]) {
    const page = LEGACY_SECTIONS[section[0]];
    const t = await getTranslator();
    const title = t(page.title);
    return (
      <ModuleSectionPage
        title={title}
        description={t(page.description)}
        emptyTitle={t("module.workspaceTitle", { name: title })}
        emptyDescription={t("module.workspaceEmpty")}
      />
    );
  }
  return <ModuleSection module="rice" section={section} />;
}
