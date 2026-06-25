import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SecretaryResult } from "@/lib/validators/secretary";

/**
 * AI 비서실장 요청/응답을 ai_requests 테이블에 기록한다 (PRD 5, 44).
 * Supabase 미설정 또는 실패 시 조용히 무시한다(기능 차단 금지).
 */
export async function logSecretaryRequest(params: {
  input: string;
  result: SecretaryResult;
  model: string;
  tokens: number;
  userId?: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    await supabase.from("ai_requests").insert({
      user_id: params.userId ?? null,
      input: params.input,
      category: params.result.category,
      summary: params.result.summary,
      analysis: params.result.analysis,
      recommendation: params.result.recommendation,
      next_todos: params.result.nextTodos,
      model: params.model,
      tokens: params.tokens,
    });
  } catch {
    // 로깅 실패는 사용자 응답에 영향을 주지 않는다.
  }
}
