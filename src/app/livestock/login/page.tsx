import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/config/app";

export default function LegacyLoginRedirect() {
  redirect(LOGIN_PATH);
}
