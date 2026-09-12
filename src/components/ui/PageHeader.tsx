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
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-navy sm:text-[22px]">{title}</h1>
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
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
        {links.map((item) => {
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex min-w-0 items-center gap-2 rounded-[16px] border border-black/[0.04] bg-white px-3 py-3 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover sm:gap-3 sm:px-4 sm:py-3.5"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#f3f5f8] text-navy sm:h-10 sm:w-10 sm:rounded-[12px]">
                <NavGlyph name={item.icon} className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              </span>
              <span className="min-w-0 flex-1 break-words text-[13px] font-semibold text-navy sm:text-sm">{item.label}</span>
              <ArrowUpRight className="hidden h-4 w-4 shrink-0 text-slate-400 group-hover:text-navy sm:block" />
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
