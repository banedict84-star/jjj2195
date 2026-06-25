import { z } from "zod";

/** AI 비서실장이 분류하는 6개 업무 카테고리 (PRD 5장) */
export const CATEGORIES = [
  "민원",
  "조직",
  "일정",
  "홍보",
  "정책",
  "뉴스",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** 사용자 → 서버 요청 */
export const SecretaryRequestSchema = z.object({
  input: z.string().min(1, "요청 내용을 입력하세요.").max(4000),
  // 현재 저장된 데이터 스냅샷(클라이언트가 전달) — AI 가 실제 데이터로 답하게 함
  context: z.string().max(12000).optional(),
  // 현재 시각(클라이언트 기준) — '내일/다음주' 같은 상대 날짜 계산용
  now: z.string().max(100).optional(),
});
export type SecretaryRequest = z.infer<typeof SecretaryRequestSchema>;

/** AI 가 수행할 동작(자연어 명령 → 실제 등록) */
export const ActionSchema = z.object({
  kind: z.enum(["none", "create_event", "create_minwon"]),
  title: z.string(),
  datetime: z.string(), // ISO 8601 또는 ""
  location: z.string(),
  detail: z.string(),
});
export type SecretaryAction = z.infer<typeof ActionSchema>;

/**
 * AI 응답 4단 고정 포맷 (PRD 5장: 핵심요약/상황분석/추천행동/다음할일)
 * OpenAI structured output 으로 강제 검증한다.
 */
export const SecretaryResultSchema = z.object({
  category: z.enum(CATEGORIES),
  summary: z.string(), // 핵심요약
  analysis: z.string(), // 상황분석
  recommendation: z.string(), // 추천행동
  nextTodos: z.array(z.string()), // 다음 할 일
  action: ActionSchema.optional(), // 실제 등록 동작(있을 때만)
});
export type SecretaryResult = z.infer<typeof SecretaryResultSchema>;
