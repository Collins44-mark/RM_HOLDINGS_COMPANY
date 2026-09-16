import { notFound, redirect } from "next/navigation";
import { SupermarketPlaceholder } from "@/components/supermarket/SupermarketPlaceholder";
import { SUPERMARKET_PLACEHOLDERS } from "@/lib/data/supermarket-placeholders";

const PURCHASING_REDIRECTS: Record<string, string> = {
  "/supermarket/purchases": "/supermarket/purchasing?tab=purchases",
  "/supermarket/purchase-orders": "/supermarket/purchasing",
  "/supermarket/suppliers": "/supermarket/purchasing?tab=suppliers",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  const href = `/supermarket/${section.join("/")}`;
  const redirected = PURCHASING_REDIRECTS[href];
  if (redirected) redirect(redirected);
  const page = SUPERMARKET_PLACEHOLDERS[href];
  return { title: page?.title ?? "Supermarket" };
}

export default async function SupermarketSectionRoute({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  const href = `/supermarket/${section.join("/")}`;
  const redirected = PURCHASING_REDIRECTS[href];
  if (redirected) redirect(redirected);
  const page = SUPERMARKET_PLACEHOLDERS[href];
  if (!page) notFound();

  return <SupermarketPlaceholder title={page.title} description={page.description} />;
}
