"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { visibleNav } from "@/lib/roles";
import { useRole } from "./RoleContext";

export default function Sidebar() {
  const pathname = usePathname();
  const { role } = useRole();
  const items = visibleNav(role);

  return (
    <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white md:block">
      <div className="flex h-14 items-center gap-2 px-5">
        <span className="text-lg">🏛️</span>
        <span className="font-bold">장윤정 AI 비서실</span>
      </div>
      <nav className="px-3 py-2">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-brand/10 font-semibold text-brand"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
