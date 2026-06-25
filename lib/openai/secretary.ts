import { getOpenAI, OPENAI_MODEL } from "./client";
import {
  CATEGORIES,
  SecretaryResult,
  SecretaryResultSchema,
} from "@/lib/validators/secretary";

const SYSTEM_PROMPT = `당신은 '장윤정 AI 비서실장'입니다. 의원실(국회/지방의회) 업무를 보좌하는 한국어 AI 비서입니다.

사용자의 요청을 분석하여 다음 6개 업무 중 하나로 분류하세요:
- 민원: 지역 주민 민원 접수/처리/통계 관련
- 조직: 인물/조직/연락 관리(CRM) 관련
- 일정: 일정/행사/참석자/결과보고 관련
- 홍보: 보도자료/SNS/문자/웹자보 등 홍보물 관련
- 정책: 5분발언/도정질문/조례검토 등 정책 지원 관련
- 뉴스: 뉴스 수집/언론 모니터링/보고 관련

그리고 항상 아래 4단 형식으로 한국어로 응답하세요:
1) summary(핵심요약): 요청의 핵심을 1~2문장으로
2) analysis(상황분석): 맥락과 고려사항을 구체적으로
3) recommendation(추천행동): 실무자가 취할 구체적 행동 권고
4) nextTodos(다음 할 일): 바로 실행 가능한 체크리스트 항목들(짧은 문장 배열)

정치적으로 중립적이고 사실에 근거하며, 의원실 실무에 바로 쓸 수 있게 실용적으로 작성하세요.`;

/** OpenAI structured output 스키마 (4단 포맷 강제) */
const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "secretary_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        category: { type: "string", enum: [...CATEGORIES] },
        summary: { type: "string" },
        analysis: { type: "string" },
        recommendation: { type: "string" },
        nextTodos: { type: "array", items: { type: "string" } },
      },
      required: [
        "category",
        "summary",
        "analysis",
        "recommendation",
        "nextTodos",
      ],
    },
  },
};

export class SecretaryError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * 사용자 요청을 분류하고 4단 포맷 응답을 생성한다.
 * @returns 검증된 SecretaryResult 와 사용 토큰 수
 */
export async function runSecretary(
  input: string,
  apiKey?: string
): Promise<{ result: SecretaryResult; tokens: number; model: string }> {
  const client = getOpenAI(apiKey);
  if (!client) {
    throw new SecretaryError(
      "NO_API_KEY",
      "OPENAI_API_KEY 가 설정되지 않았습니다. .env.local 을 확인하세요."
    );
  }

  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.4,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: input },
    ],
    response_format: RESPONSE_FORMAT,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new SecretaryError("EMPTY_RESPONSE", "AI 응답이 비어 있습니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SecretaryError("PARSE_ERROR", "AI 응답 형식이 올바르지 않습니다.");
  }

  const validated = SecretaryResultSchema.safeParse(parsed);
  if (!validated.success) {
    throw new SecretaryError(
      "SCHEMA_ERROR",
      "AI 응답이 4단 포맷 스키마를 만족하지 않습니다."
    );
  }

  return {
    result: validated.data,
    tokens: completion.usage?.total_tokens ?? 0,
    model: OPENAI_MODEL,
  };
}
