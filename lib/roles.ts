/** 사용자 역할 (PRD 4장) */
export const ROLES = [
  "의원",
  "정책지원관",
  "비서",
  "홍보담당",
  "조직담당",
] as const;

export type Role = (typeof ROLES)[number];

/** 사이드바 메뉴 정의 — 역할별 노출 제어 */
export interface NavItem {
  href: string;
  label: string;
  icon: string; // 간단한 이모지 아이콘 (추후 아이콘 컴포넌트로 교체)
  roles: Role[] | "all";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "대시보드", icon: "🏠", roles: "all" },
  { href: "/secretary", label: "AI 비서실장", icon: "🤖", roles: "all" },
  { href: "/crm", label: "CRM", icon: "👥", roles: ["조직담당", "의원"] },
  { href: "/minwon", label: "민원", icon: "📮", roles: ["비서", "의원"] },
  { href: "/schedule", label: "일정·행사", icon: "📅", roles: ["비서", "의원"] },
  { href: "/pr", label: "홍보", icon: "📣", roles: ["홍보담당", "의원"] },
  { href: "/policy", label: "정책", icon: "📑", roles: ["정책지원관", "의원"] },
  { href: "/news", label: "뉴스", icon: "📰", roles: ["정책지원관", "의원"] },
  { href: "/admin", label: "관리", icon: "⚙️", roles: ["의원"] },
];

/** 의원은 전체 메뉴 접근. 그 외 역할은 자기 업무 + 공통 메뉴만. */
export function visibleNav(role: Role): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => item.roles === "all" || item.roles.includes(role)
  );
}
