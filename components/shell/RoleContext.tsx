"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { Role } from "@/lib/roles";

interface RoleCtx {
  role: Role;
  setRole: (r: Role) => void;
}

const Ctx = createContext<RoleCtx | null>(null);

/**
 * 데모용 역할 컨텍스트. 추후 Supabase Auth 세션의 profiles.role 로 대체된다.
 * 현재는 상단바 역할 전환기로 권한별 UI 를 미리 확인할 수 있게 한다.
 */
export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>("의원");

  useEffect(() => {
    const saved = localStorage.getItem("demo-role") as Role | null;
    if (saved) setRoleState(saved);
  }, []);

  const setRole = (r: Role) => {
    setRoleState(r);
    localStorage.setItem("demo-role", r);
  };

  return <Ctx.Provider value={{ role, setRole }}>{children}</Ctx.Provider>;
}

export function useRole(): RoleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
