import { ModuleDashboard } from "@/components/ui/PageHeader";
import { getBusinessUnit } from "@/lib/config/app";
import { MODULE_NAV } from "@/lib/config/navigation";
import type { ModuleCode } from "@/lib/config/app";

export function ModuleHome({ module }: { module: Exclude<ModuleCode, "owner"> }) {
  const unit = getBusinessUnit(module);
  const nav = MODULE_NAV[module] ?? [];
  const links = nav
    .filter((item) => !item.exact)
    .flatMap((item) => (item.children?.length ? item.children : [item]))
    .map((item) => ({ href: item.href, label: item.label, icon: item.icon }));

  return (
    <ModuleDashboard
      title={unit?.name ?? module}
      location={unit?.location ?? ""}
      description={unit?.description ?? ""}
      links={links}
    />
  );
}
