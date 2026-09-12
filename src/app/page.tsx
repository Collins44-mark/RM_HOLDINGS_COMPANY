import { redirect } from "next/navigation";
import { defaultHomeFor } from "@/lib/auth/access";
import { getAuthUser, identityFromUser } from "@/lib/auth/session";
import { LOGIN_PATH } from "@/lib/config/app";

export default async function HomePage() {
  const user = await getAuthUser();
  if (user) {
    redirect(defaultHomeFor(identityFromUser(user)));
  }
  redirect(LOGIN_PATH);
}
