import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOpenAI, OPENAI_MODEL } from "@/lib/openai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ReqSchema = z.object({
  type: z.enum(["보도자료", "SNS", "문자"]),
  topic: z.string().min(1, "주제를 입력하세요.").max(300),
  tone: z.enum(["공식", "친근", "강조"]).optional().default("공식"),
});

const GUIDE: Record<string, string> = {
  보도자료:
    "언론 배포용 보도자료. 제목, 부제, 본문(리드문단+상세), 그리고 의원 코멘트 인용을 포함. 객관적 문체.",
  SNS:
    "SNS 게시글(페이스북/인스타 캡션). 도입 후크 + 핵심 메시지 + 해시태그 5개. 친근하고 가독성 높게, 이모지 약간 사용.",
  문자:
    "지역 주민 안내 문자(LMS, 한국어 기준 약 300자 이내). 핵심 정보 위주로 간결하게, 마지막에 발신자 명시.",
};

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_JSON", message: "잘못된 요청입니다." } },
      { status: 400 }
    );
  }
  const parsed = ReqSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: parsed.error.issues[0]?.message ?? "입력 오류",
        },
      },
      { status: 400 }
    );
  }

  const client = getOpenAI(req.headers.get("x-openai-key") || undefined);
  if (!client) {
    return NextResponse.json(
      {
        error: {
          code: "NO_API_KEY",
          message:
            "OPENAI_API_KEY 가 없습니다. 내용을 직접 작성해 저장할 수 있습니다.",
        },
      },
      { status: 503 }
    );
  }

  const { type, topic, tone } = parsed.data;
  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `당신은 의원실 홍보담당입니다. 정치적으로 중립적이고 사실에 근거하여 한국어로 작성합니다. 톤: ${tone}. ${GUIDE[type]}`,
        },
        { role: "user", content: `주제: ${topic}` },
      ],
    });
    const text = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ data: { body: text } });
  } catch (err) {
    console.error("[pr/text]", err);
    return NextResponse.json(
      {
        error: {
          code: "AI_ERROR",
          message: "AI 생성 실패. 내용을 직접 작성해 저장할 수 있습니다.",
        },
      },
      { status: 502 }
    );
  }
}
