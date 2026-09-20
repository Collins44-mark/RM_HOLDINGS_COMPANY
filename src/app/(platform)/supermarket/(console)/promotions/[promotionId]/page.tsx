import { PromotionDetailPage } from "@/components/supermarket/promotions/PromotionDetailPage";

export const metadata = { title: "Promotion Details" };

export default async function SupermarketPromotionDetailRoute({
  params,
}: {
  params: Promise<{ promotionId: string }>;
}) {
  const { promotionId } = await params;
  return <PromotionDetailPage promotionId={promotionId} />;
}
