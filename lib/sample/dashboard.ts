/**
 * 대시보드 표시용 샘플 데이터.
 * 추후 Supabase 집계(View/RPC)로 대체된다. (PRD 6, 14)
 */
import type { SecretaryResult } from "@/lib/validators/secretary";

export interface Kpi {
  label: string;
  value: number;
  unit: string;
  href: string;
  tone: "rose" | "sky" | "amber" | "violet";
}

export const SAMPLE_KPIS: Kpi[] = [
  { label: "미처리 민원", value: 7, unit: "건", href: "/minwon", tone: "rose" },
  { label: "오늘 일정", value: 3, unit: "건", href: "/schedule", tone: "sky" },
  { label: "신규 부정뉴스", value: 2, unit: "건", href: "/news", tone: "amber" },
  { label: "발행대기 홍보", value: 4, unit: "건", href: "/pr", tone: "violet" },
];

export interface ActivityItem {
  time: string;
  category: string;
  text: string;
}

export const SAMPLE_ACTIVITY: ActivityItem[] = [
  { time: "08:40", category: "민원", text: "신호체계 개선 민원 1건 접수 (행신동)" },
  { time: "09:15", category: "일정", text: "오전 10시 청년정책 간담회 — 참석자 12명 확정" },
  { time: "09:50", category: "뉴스", text: "지역 교통 관련 부정 보도 1건 모니터링됨" },
  { time: "10:30", category: "홍보", text: "보도자료 '청년 일자리 대책' 초안 검토 대기" },
];

/** '오늘의 AI 브리핑' 예시 (실제로는 /api/secretary 결과로 대체) */
export const SAMPLE_BRIEFING: SecretaryResult = {
  category: "일정",
  summary: "오늘은 일정 3건과 미처리 민원 7건이 있으며, 오전 간담회가 핵심입니다.",
  analysis:
    "오전 10시 청년정책 간담회에 참석자 12명이 확정됐고, 교통 분야 부정 보도 1건이 모니터링되어 대응 검토가 필요합니다. 미처리 민원 중 2건은 마감이 임박했습니다.",
  recommendation:
    "간담회 전 발언자료를 최종 점검하고, 교통 보도는 사실관계 확인 후 필요 시 입장자료를 준비하세요. 마감 임박 민원 2건을 우선 배정하시기 바랍니다.",
  nextTodos: [
    "간담회 발언자료 최종본 확인",
    "교통 부정보도 사실관계 확인 후 대응 여부 결정",
    "마감 임박 민원 2건 담당자 배정",
  ],
};
