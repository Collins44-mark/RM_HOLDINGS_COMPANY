import { ModuleDashboard } from "@/components/ui/PageHeader";
import { getBusinessUnit } from "@/lib/config/app";
import { MODULE_NAV } from "@/lib/config/navigation";
import type { ModuleCode } from "@/lib/config/app";
import { getBusinessUnitByCode } from "@/lib/data/business-units";

export async function ModuleHome({ module }: { module: Exclude<ModuleCode, "owner"> }) {
  const unit = await getBusinessUnitByCode(module);
  const presentation = getBusinessUnit(module);
  const nav = MODULE_NAV[module] ?? [];
  const links = nav
    .filter((item) => !item.exact)
    .flatMap((item) => (item.children?.length ? item.children : [item]))
    .map((item) => ({ href: item.href, label: item.label, icon: item.icon }));

  return (
    <ModuleDashboard
      title={unit?.name ?? presentation?.name ?? module}
      location={unit?.location ?? "Location not set"}
      description={presentation?.description ?? ""}
      links={links}
    />
  );
}
