import { AuthenticatedShell } from "@/components/layout/AuthenticatedShell";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
