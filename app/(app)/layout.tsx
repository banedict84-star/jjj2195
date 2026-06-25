import { RoleProvider } from "@/components/shell/RoleContext";
import Sidebar from "@/components/shell/Sidebar";
import Topbar from "@/components/shell/Topbar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </RoleProvider>
  );
}
