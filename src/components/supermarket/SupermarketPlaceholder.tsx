import { EmptyState, PageHeader } from "@/components/ui/PageHeader";

export function SupermarketPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState title={title} description={description} />
    </div>
  );
}
