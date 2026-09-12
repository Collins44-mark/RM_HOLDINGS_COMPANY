import { cn } from "@/lib/cn";
import { TYPE } from "@/lib/theme/tokens";

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div>
        <h2 className={TYPE.sectionTitle}>
          {title}
        </h2>
        {description ? (
          <p className={`mt-1 leading-5 ${TYPE.sectionSubtitle}`}>
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
