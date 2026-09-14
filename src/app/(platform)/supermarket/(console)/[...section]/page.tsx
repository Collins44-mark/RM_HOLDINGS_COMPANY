import { notFound } from "next/navigation";
import { SupermarketPlaceholder } from "@/components/supermarket/SupermarketPlaceholder";
import { SUPERMARKET_PLACEHOLDERS } from "@/lib/data/supermarket-placeholders";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  const page = SUPERMARKET_PLACEHOLDERS[`/supermarket/${section.join("/")}`];
  return { title: page?.title ?? "Supermarket" };
}

export default async function SupermarketSectionRoute({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  const href = `/supermarket/${section.join("/")}`;
  const page = SUPERMARKET_PLACEHOLDERS[href];
  if (!page) notFound();

  return <SupermarketPlaceholder title={page.title} description={page.description} />;
}
