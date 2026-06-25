import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 Supabase 클라이언트 (service-role).
 * 환경변수가 없으면 null 을 반환하여, Supabase 미설정 상태에서도
 * AI 비서실장 기능이 동작하도록 한다(로깅만 생략).
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
