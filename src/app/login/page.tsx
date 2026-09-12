import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath =
    typeof params.next === "string" && params.next.startsWith("/")
      ? params.next
      : undefined;

  return (
    <LoginForm
      title="Sign in to RM Holdings"
      subtitle="Access your business management workspace"
      nextPath={nextPath}
    />
  );
}
