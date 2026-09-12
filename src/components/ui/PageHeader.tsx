import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { NavGlyph } from "@/components/icons/nav-icons";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-navy">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[13.5px] leading-6 text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[18px] border border-dashed border-black/10 bg-white px-6 py-14 text-center shadow-card">
      <p className="text-[15px] font-semibold text-navy">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

export function Surface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[18px] border border-black/[0.04] bg-white shadow-card", className)}>
      {children}
    </div>
  );
}

export function ModuleDashboard({
  title,
  location,
  description,
  links,
}: {
  title: string;
  location: string;
  description: string;
  links: { href: string; label: string; icon: string }[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={`${location}. ${description}`}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {links.map((item) => {
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-3 rounded-[16px] border border-black/[0.04] bg-white px-4 py-3.5 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#f3f5f8] text-navy">
                <NavGlyph name={item.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="flex-1 text-sm font-semibold text-navy">{item.label}</span>
              <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-navy" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function ModuleSectionPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <EmptyState
        title={`${title} workspace`}
        description="This section is connected to the RM Holdings data model and permission system. Operational records will be managed here in the next implementation phase."
      />
    </div>
  );
}
