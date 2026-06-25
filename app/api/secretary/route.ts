import { NextRequest, NextResponse } from "next/server";
import { SecretaryRequestSchema } from "@/lib/validators/secretary";
import { runSecretary, SecretaryError } from "@/lib/openai/secretary";
import { logSecretaryRequest } from "@/lib/secretary/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 1) 입력 검증
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_JSON", message: "잘못된 요청 형식입니다." } },
      { status: 400 }
    );
  }

  const parsed = SecretaryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
        },
      },
      { status: 400 }
    );
  }

  // 2) AI 비서실장 실행 (분류 + 4단 응답)
  try {
    const userKey = req.headers.get("x-openai-key") || undefined;
    const { result, tokens, model } = await runSecretary(
      parsed.data.input,
      userKey,
      parsed.data.context
    );

    // 3) 로깅 (Supabase 설정 시) — 실패해도 응답에 영향 없음
    await logSecretaryRequest({
      input: parsed.data.input,
      result,
      tokens,
      model,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof SecretaryError) {
      const status = err.code === "NO_API_KEY" ? 503 : 502;
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status }
      );
    }
    console.error("[secretary] unexpected error", err);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "AI 처리 중 오류가 발생했습니다." } },
      { status: 500 }
    );
  }
}
