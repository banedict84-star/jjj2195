const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const Anthropic = require("@anthropic-ai/sdk");
const { google } = require("googleapis");

// ── 시크릿(환경변수) 정의 ──────────────────────────────────────────────
// 배포 전에 아래 명령으로 값을 등록해야 합니다.
//   firebase functions:secrets:set ANTHROPIC_API_KEY
//   firebase functions:secrets:set GOOGLE_CLIENT_ID
//   firebase functions:secrets:set GOOGLE_CLIENT_SECRET
//   firebase functions:secrets:set GOOGLE_REFRESH_TOKEN
//   firebase functions:secrets:set GOOGLE_CALENDAR_ID   (선택, 기본 primary)
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");
const GOOGLE_REFRESH_TOKEN = defineSecret("GOOGLE_REFRESH_TOKEN");
const GOOGLE_CALENDAR_ID = defineSecret("GOOGLE_CALENDAR_ID");

const TIMEZONE = "Asia/Seoul";

// ── 카카오 응답 헬퍼 ───────────────────────────────────────────────────
function kakaoText(text) {
  return {
    version: "2.0",
    template: {
      outputs: [{ simpleText: { text } }],
    },
  };
}

// 현재 한국 시각을 사람이 읽는 문자열로 (모델이 "내일/다음주" 같은 표현을 해석할 기준)
function nowInKST() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  // 예: 2026-06-24 (수요일) 14:30
  return `${parts.year}-${parts.month}-${parts.day} (${parts.weekday}) ${parts.hour}:${parts.minute}`;
}

// ── 1) 자연어 → 구조화된 일정 (Claude Haiku) ────────────────────────────
const EVENT_SCHEMA = {
  type: "object",
  properties: {
    is_schedule: {
      type: "boolean",
      description: "메시지가 일정 등록 요청이면 true, 단순 인사/질문 등이면 false",
    },
    title: { type: "string", description: "일정 제목 (없으면 핵심 내용 요약)" },
    date: {
      type: "string",
      description: "일정 날짜 YYYY-MM-DD. 명시 안 됐으면 오늘 날짜",
    },
    start_time: {
      type: ["string", "null"],
      description: "시작 시각 HH:MM (24시간제). 시간 미지정이면 null",
    },
    end_time: {
      type: ["string", "null"],
      description: "종료 시각 HH:MM. 미지정이면 null (시작+1시간으로 처리)",
    },
    all_day: { type: "boolean", description: "종일 일정이면 true" },
    location: { type: ["string", "null"], description: "장소. 없으면 null" },
    description: { type: ["string", "null"], description: "추가 메모. 없으면 null" },
  },
  required: [
    "is_schedule",
    "title",
    "date",
    "start_time",
    "end_time",
    "all_day",
    "location",
    "description",
  ],
  additionalProperties: false,
};

async function parseSchedule(utterance, apiKey) {
  const client = new Anthropic({ apiKey });
  const today = nowInKST();

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system:
      `너는 카카오톡 메시지에서 일정 정보를 추출하는 비서다.\n` +
      `현재 한국 시각: ${today}\n` +
      `"내일", "모레", "다음 주 금요일", "오후 3시" 같은 상대 표현을 위 기준으로 정확한 날짜/시각으로 변환하라.\n` +
      `시간이 명시되지 않은 약속이면 all_day=false, start_time=null 로 두지 말고, ` +
      `정말 종일 일정(예: "6월 25일 휴가")이면 all_day=true 로 한다.\n` +
      `일정 등록 요청이 아니면 is_schedule=false 로 한다.`,
    messages: [{ role: "user", content: utterance }],
    output_config: { format: { type: "json_schema", schema: EVENT_SCHEMA } },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return JSON.parse(textBlock.text);
}

// ── 2) 구글 캘린더에 일정 등록 ──────────────────────────────────────────
function buildCalendarClient(creds) {
  const oauth2 = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
  oauth2.setCredentials({ refresh_token: creds.refreshToken });
  return google.calendar({ version: "v3", auth: oauth2 });
}

async function createEvent(parsed, creds) {
  const calendar = buildCalendarClient(creds);

  let event;
  if (parsed.all_day) {
    // 종일 일정: date 사용, 종료일은 다음 날(구글 캘린더 규칙: end는 exclusive)
    const end = new Date(parsed.date + "T00:00:00");
    end.setDate(end.getDate() + 1);
    const endDate = end.toISOString().slice(0, 10);
    event = {
      summary: parsed.title,
      location: parsed.location || undefined,
      description: parsed.description || undefined,
      start: { date: parsed.date },
      end: { date: endDate },
    };
  } else {
    const startTime = parsed.start_time || "09:00";
    const startDateTime = `${parsed.date}T${startTime}:00`;
    let endTime = parsed.end_time;
    if (!endTime) {
      // 종료 미지정 → 시작 + 1시간
      const [h, m] = startTime.split(":").map(Number);
      const e = new Date(2000, 0, 1, h + 1, m);
      endTime = `${String(e.getHours()).padStart(2, "0")}:${String(
        e.getMinutes()
      ).padStart(2, "0")}`;
    }
    const endDateTime = `${parsed.date}T${endTime}:00`;
    event = {
      summary: parsed.title,
      location: parsed.location || undefined,
      description: parsed.description || undefined,
      start: { dateTime: startDateTime, timeZone: TIMEZONE },
      end: { dateTime: endDateTime, timeZone: TIMEZONE },
    };
  }

  const res = await calendar.events.insert({
    calendarId: creds.calendarId || "primary",
    requestBody: event,
  });
  return res.data;
}

// 사용자에게 보여줄 확인 메시지
function confirmText(parsed, eventData) {
  const weekday = new Date(parsed.date + "T00:00:00").toLocaleDateString(
    "ko-KR",
    { weekday: "short" }
  );
  let when;
  if (parsed.all_day) {
    when = `${parsed.date} (${weekday}) · 종일`;
  } else {
    const start = parsed.start_time || "09:00";
    when = `${parsed.date} (${weekday}) ${start}`;
  }
  let msg = `✅ 일정이 등록됐어요!\n\n📌 ${parsed.title}\n🕒 ${when}`;
  if (parsed.location) msg += `\n📍 ${parsed.location}`;
  if (eventData && eventData.htmlLink) msg += `\n\n🔗 ${eventData.htmlLink}`;
  return msg;
}

// ── 3) 카카오 i 오픈빌더 스킬 웹훅 ──────────────────────────────────────
exports.kakaoSkill = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 30,
    secrets: [
      ANTHROPIC_API_KEY,
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REFRESH_TOKEN,
      GOOGLE_CALENDAR_ID,
    ],
  },
  async (req, res) => {
    try {
      const utterance =
        req.body &&
        req.body.userRequest &&
        req.body.userRequest.utterance
          ? String(req.body.userRequest.utterance).trim()
          : "";

      if (!utterance) {
        return res.json(
          kakaoText("일정을 입력해 주세요. 예) 내일 오후 3시 강남에서 회의")
        );
      }

      // 1) 파싱
      const parsed = await parseSchedule(utterance, ANTHROPIC_API_KEY.value());

      if (!parsed.is_schedule) {
        return res.json(
          kakaoText(
            "일정으로 등록할 내용을 알려주세요.\n예) 다음 주 금요일 점심 약속, 6월 25일 휴가"
          )
        );
      }

      // 2) 캘린더 등록
      const eventData = await createEvent(parsed, {
        clientId: GOOGLE_CLIENT_ID.value(),
        clientSecret: GOOGLE_CLIENT_SECRET.value(),
        refreshToken: GOOGLE_REFRESH_TOKEN.value(),
        calendarId: GOOGLE_CALENDAR_ID.value(),
      });

      // 3) 확인 응답
      return res.json(kakaoText(confirmText(parsed, eventData)));
    } catch (e) {
      console.error("kakaoSkill error:", e);
      return res.json(
        kakaoText(
          "일정 등록 중 문제가 생겼어요 😢\n잠시 후 다시 시도하거나 표현을 바꿔서 입력해 주세요."
        )
      );
    }
  }
);
