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
});
export type SecretaryRequest = z.infer<typeof SecretaryRequestSchema>;

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
});
export type SecretaryResult = z.infer<typeof SecretaryResultSchema>;
