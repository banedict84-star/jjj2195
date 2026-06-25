import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOpenAI, OPENAI_MODEL } from "@/lib/openai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ReqSchema = z.object({
  type: z.enum(["5분발언", "도정질문", "조례검토"]),
  title: z.string().min(1, "제목을 입력하세요.").max(200),
  source: z.string().max(1000).optional().default(""),
});

const GUIDE: Record<string, string> = {
  "5분발언":
    "경기도의회 본회의 5분 자유발언 원고. '존경하는 의장님, 그리고 선배·동료 의원 여러분' 으로 시작하고, 문제제기→근거→대안→촉구 순으로 약 600~800자.",
  도정질문:
    "도정질문 형식. 현안 배경 설명 후 집행부에 묻는 구체적 질문 3~5개를 번호로 제시.",
  조례검토:
    "조례안 검토의견서. 제안배경, 주요내용, 검토의견(타당성·문제점), 결론 순으로 작성.",
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

  const { type, title, source } = parsed.data;
  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: `당신은 의원실 정책지원관입니다. 정치적으로 중립적이고 사실에 근거하여 한국어로 작성합니다. ${GUIDE[type]}`,
        },
        {
          role: "user",
          content: `주제: ${title}\n${source ? `참고자료: ${source}` : ""}`,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ data: { content } });
  } catch (err) {
    console.error("[policy/generate]", err);
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
