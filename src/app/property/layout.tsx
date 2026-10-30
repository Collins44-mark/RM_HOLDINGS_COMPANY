import { AuthenticatedShell } from "@/components/layout/AuthenticatedShell";

export default function PropertyLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
