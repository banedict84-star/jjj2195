"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { visibleNav } from "@/lib/roles";
import { useRole } from "./RoleContext";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { role } = useRole();
  const items = visibleNav(role);
  return (
    <nav className="px-3 py-2">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
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
  );
}

function Brand() {
  return (
    <div className="flex h-14 items-center gap-2 px-5">
      <span className="text-lg">🏛️</span>
      <span className="font-bold">장윤정 AI 비서실</span>
    </div>
  );
}

export default function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* 데스크톱: 고정 사이드바 */}
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white md:block">
        <Brand />
        <NavLinks />
      </aside>

      {/* 모바일: 드로어 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={onClose}
          />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button
                onClick={onClose}
                aria-label="닫기"
                className="rounded p-2 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <NavLinks onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
