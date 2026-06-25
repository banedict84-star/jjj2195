import { z } from "zod";

/** 웹자보 문구 생성 요청 (PRD 23) */
export const PosterRequestSchema = z.object({
  topic: z.string().min(1, "주제를 입력하세요.").max(200),
  keyMessage: z.string().max(500).optional().default(""),
  tone: z.enum(["공식", "친근", "강조"]).optional().default("공식"),
});
export type PosterRequest = z.infer<typeof PosterRequestSchema>;

/**
 * 웹자보 콘텐츠(문구) 구조. OpenAI structured output 으로 강제하고,
 * 포스터 템플릿에 그대로 바인딩한다.
 */
export const PosterContentSchema = z.object({
  headline: z.string(), // 큰 제목 (한 줄)
  subhead: z.string(), // 부제 (한 줄)
  points: z.array(z.string()), // 핵심 문구(불릿) 2~4개
  hashtags: z.array(z.string()), // 해시태그 (# 제외 텍스트)
  cta: z.string(), // 행동유도/안내 문구 (일시·장소·문의 등)
});
export type PosterContent = z.infer<typeof PosterContentSchema>;
