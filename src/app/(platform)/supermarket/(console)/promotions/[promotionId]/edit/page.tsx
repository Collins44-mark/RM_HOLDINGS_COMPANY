import { PromotionEditPage } from "@/components/supermarket/promotions/PromotionEditPage";

export const metadata = { title: "Edit Promotion" };

export default async function SupermarketEditPromotionRoute({
  params,
}: {
  params: Promise<{ promotionId: string }>;
}) {
  const { promotionId } = await params;
  return <PromotionEditPage promotionId={promotionId} />;
}
