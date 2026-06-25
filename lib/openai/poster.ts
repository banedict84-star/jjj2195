import { getOpenAI, OPENAI_MODEL } from "./client";
import {
  PosterContent,
  PosterContentSchema,
  PosterRequest,
} from "@/lib/validators/pr";

const SYSTEM_PROMPT = `당신은 의원실(국회/지방의회) 홍보담당을 돕는 한국어 카피라이터입니다.
주어진 주제로 SNS/웹 배포용 '웹자보'(홍보 포스터) 문구를 작성합니다.

규칙:
- headline: 시선을 끄는 핵심 제목 한 줄 (12자 내외 권장, 과장/허위 금지)
- subhead: 제목을 보완하는 부제 한 줄
- points: 핵심 메시지 불릿 2~4개 (각 20자 내외, 간결하게)
- hashtags: 관련 해시태그 3~5개 (# 기호 없이 텍스트만)
- cta: 일시·장소·문의 등 안내 또는 행동유도 한 줄 (정보가 없으면 일반적인 안내문)

정치적으로 중립적이고 사실에 근거하며, 포스터에 바로 얹을 수 있게 짧고 명확하게 작성하세요.`;

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "poster_content",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        headline: { type: "string" },
        subhead: { type: "string" },
        points: { type: "array", items: { type: "string" } },
        hashtags: { type: "array", items: { type: "string" } },
        cta: { type: "string" },
      },
      required: ["headline", "subhead", "points", "hashtags", "cta"],
    },
  },
};

export class PosterError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function generatePoster(
  req: PosterRequest,
  apiKey?: string
): Promise<{ content: PosterContent; tokens: number; model: string }> {
  const client = getOpenAI(apiKey);
  if (!client) {
    throw new PosterError(
      "NO_API_KEY",
      "OPENAI_API_KEY 가 설정되지 않았습니다. 문구를 직접 입력해 포스터를 만들 수 있습니다."
    );
  }

  const userContent = [
    `주제: ${req.topic}`,
    req.keyMessage ? `핵심 메시지: ${req.keyMessage}` : "",
    `톤: ${req.tone}`,
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.7,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: RESPONSE_FORMAT,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new PosterError("EMPTY_RESPONSE", "AI 응답이 비어 있습니다.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PosterError("PARSE_ERROR", "AI 응답 형식이 올바르지 않습니다.");
  }

  const validated = PosterContentSchema.safeParse(parsed);
  if (!validated.success) {
    throw new PosterError("SCHEMA_ERROR", "AI 응답 스키마가 올바르지 않습니다.");
  }

  return {
    content: validated.data,
    tokens: completion.usage?.total_tokens ?? 0,
    model: OPENAI_MODEL,
  };
}
