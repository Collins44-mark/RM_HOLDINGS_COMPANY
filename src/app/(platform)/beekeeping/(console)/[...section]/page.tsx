import { redirect } from "next/navigation";

export default async function BeekeepingSectionRoute({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  const head = section[0];
  if (head === "hives" || head === "harvests" || head === "sales") redirect(`/beekeeping/${head}`);
  redirect("/beekeeping");
}
