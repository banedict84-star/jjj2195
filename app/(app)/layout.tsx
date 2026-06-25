import { RoleProvider } from "@/components/shell/RoleContext";
import Shell from "@/components/shell/Shell";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleProvider>
      <Shell>{children}</Shell>
    </RoleProvider>
  );
}
