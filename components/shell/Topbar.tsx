"use client";

import { ROLES } from "@/lib/roles";
import { useRole } from "./RoleContext";

export default function Topbar({ onMenu }: { onMenu?: () => void }) {
  const { role, setRole } = useRole();

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <button
          onClick={onMenu}
          aria-label="메뉴"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-50 md:hidden"
        >
          ☰
        </button>
        <input
          type="search"
          placeholder="통합 검색…"
          className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand sm:w-72"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          aria-label="알림"
          className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-50"
        >
          🔔
        </button>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-400 sm:inline">역할</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand"
            title="데모용 역할 전환 (추후 로그인 세션으로 대체)"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
