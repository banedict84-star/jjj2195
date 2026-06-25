import OpenAI from "openai";

/**
 * OpenAI 클라이언트는 서버에서만 생성한다 (PRD 32).
 * - overrideKey: 사용자가 브라우저에서 입력해 헤더로 전달한 키(우선 사용)
 * - 없으면 서버 환경변수 OPENAI_API_KEY 사용
 * 둘 다 없으면 null → 라우트에서 친절한 오류/로컬 폴백 처리.
 */
let cached: OpenAI | null = null;

export function getOpenAI(overrideKey?: string): OpenAI | null {
  const userKey = overrideKey?.trim();
  if (userKey) {
    // 사용자 제공 키는 캐시하지 않고 매 요청 생성(키가 섞이지 않도록)
    return new OpenAI({ apiKey: userKey });
  }
  const envKey = process.env.OPENAI_API_KEY;
  if (!envKey) return null;
  if (!cached) cached = new OpenAI({ apiKey: envKey });
  return cached;
}

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
