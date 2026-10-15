import { notFound } from "next/navigation";
import { ModuleSectionPage } from "@/components/ui/PageHeader";
import { MODULE_NAV, type NavItem } from "@/lib/config/navigation";
import { navKeyForHref } from "@/lib/i18n";
import { getTranslator } from "@/lib/i18n/server";

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.children ? flatten(item.children) : [])]);
}

export async function ModuleSection({
  module,
  section,
}: {
  module: string;
  section: string[];
}) {
  const href = `/${module}/${section.join("/")}`;
  const match = flatten(MODULE_NAV[module] ?? []).find((item) => item.href === href);
  if (!match) notFound();
  const t = await getTranslator();
  const key = navKeyForHref(href);
  const title = key ? t(key) : match.label;

  return (
    <ModuleSectionPage
      title={title}
      description={t("module.manage", { name: title })}
      emptyTitle={t("module.workspaceTitle", { name: title })}
      emptyDescription={t("module.workspaceEmpty")}
    />
  );
}
