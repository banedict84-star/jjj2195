import OpenAI from "openai";

/**
 * OpenAI 클라이언트는 서버에서만 생성한다 (PRD 32).
 * 키가 없으면 null 을 반환하여 라우트에서 친절한 오류로 처리한다.
 */
let cached: OpenAI | null = null;

export function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!cached) {
    cached = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return cached;
}

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
