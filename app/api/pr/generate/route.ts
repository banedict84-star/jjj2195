import { NextRequest, NextResponse } from "next/server";
import { PosterRequestSchema } from "@/lib/validators/pr";
import { generatePoster, PosterError } from "@/lib/openai/poster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_JSON", message: "잘못된 요청 형식입니다." } },
      { status: 400 }
    );
  }

  const parsed = PosterRequestSchema.safeParse(body);
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

  try {
    const { content } = await generatePoster(parsed.data);
    return NextResponse.json({ data: content });
  } catch (err) {
    if (err instanceof PosterError) {
      const status = err.code === "NO_API_KEY" ? 503 : 502;
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status }
      );
    }
    console.error("[pr/generate] unexpected error", err);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "문구 생성 중 오류가 발생했습니다." } },
      { status: 500 }
    );
  }
}
