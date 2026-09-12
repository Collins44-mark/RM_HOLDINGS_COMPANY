import { notFound } from "next/navigation";
import { ModuleSectionPage } from "@/components/ui/PageHeader";
import { MODULE_NAV, type NavItem } from "@/lib/config/navigation";

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.children ? flatten(item.children) : [])]);
}

export function ModuleSection({
  module,
  section,
}: {
  module: string;
  section: string[];
}) {
  const href = `/${module}/${section.join("/")}`;
  const match = flatten(MODULE_NAV[module] ?? []).find((item) => item.href === href);
  if (!match) notFound();

  return (
    <ModuleSectionPage
      title={match.label}
      description={`Manage ${match.label.toLowerCase()} for this RM Holdings business unit. Records are stored in the shared group database and protected by role permissions.`}
    />
  );
}
