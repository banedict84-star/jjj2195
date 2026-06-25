import { NextRequest, NextResponse } from "next/server";
import { getOpenAI, OPENAI_MODEL } from "@/lib/openai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** OpenAI 키 연결 테스트 — 작은 요청을 보내 키 유효성을 확인한다. */
export async function POST(req: NextRequest) {
  const client = getOpenAI(req.headers.get("x-openai-key") || undefined);
  if (!client) {
    return NextResponse.json(
      { error: { code: "NO_KEY", message: "키가 설정되지 않았습니다." } },
      { status: 400 }
    );
  }
  try {
    await client.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 3,
      messages: [{ role: "user", content: "ping" }],
    });
    return NextResponse.json({ data: { ok: true, model: OPENAI_MODEL } });
  } catch (err) {
    const message =
      err && typeof err === "object" && "status" in err
        ? `OpenAI 오류 (${(err as { status?: number }).status}). 키가 올바른지, 결제가 활성화됐는지 확인하세요.`
        : "연결 실패. 키와 네트워크를 확인하세요.";
    return NextResponse.json({ error: { code: "AI_ERROR", message } }, { status: 502 });
  }
}
