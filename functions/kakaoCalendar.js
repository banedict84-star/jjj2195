const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const Anthropic = require("@anthropic-ai/sdk");
const { google } = require("googleapis");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

// 연동 시작 함수의 베이스 URL (멀티유저: 사용자별 캘린더 연동)
const AUTH_BASE =
  "https://asia-northeast3-jjj2195-1bd15.cloudfunctions.net";

// ── 시크릿(환경변수) 정의 ──────────────────────────────────────────────
// 배포 전에 아래 명령으로 값을 등록해야 합니다.
//   firebase functions:secrets:set ANTHROPIC_API_KEY
//   firebase functions:secrets:set GOOGLE_CLIENT_ID
//   firebase functions:secrets:set GOOGLE_CLIENT_SECRET
//   firebase functions:secrets:set GOOGLE_REFRESH_TOKEN
//   firebase functions:secrets:set GOOGLE_CALENDAR_ID   (선택, 기본 primary)
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
// 공식 Anthropic이 아니라 MyAPI 같은 호환 프록시를 쓸 때 base URL을 지정.
// 예) https://api.myapi.world  (미설정 시 공식 api.anthropic.com 사용)
const ANTHROPIC_BASE_URL = defineSecret("ANTHROPIC_BASE_URL");
// 파싱에 쓸 모델 id (미설정 시 claude-haiku-4-5). 프록시가 특정 모델만 지원하면 여기서 변경.
const ANTHROPIC_MODEL = defineSecret("ANTHROPIC_MODEL");
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");
const GOOGLE_REFRESH_TOKEN = defineSecret("GOOGLE_REFRESH_TOKEN");
const GOOGLE_CALENDAR_ID = defineSecret("GOOGLE_CALENDAR_ID");

const TIMEZONE = "Asia/Seoul";

// 등록 안 된 시크릿의 .value()는 빈 문자열/예외가 날 수 있어 안전하게 읽는다.
function optionalSecret(secret) {
  try {
    const v = secret.value();
    return v && v.length ? v : undefined;
  } catch (_) {
    return undefined;
  }
}

// ── 카카오 응답 헬퍼 ───────────────────────────────────────────────────
// 답장 아래에 뜨는 바로가기 버튼 (탭하면 해당 문구가 자동 전송됨)
const QUICK_REPLIES = [
  { label: "📅 오늘 일정", action: "message", messageText: "오늘 일정은?" },
  { label: "📅 내일 일정", action: "message", messageText: "내일 일정은?" },
  { label: "🎨 웹자보 요청", action: "message", messageText: "웹자보 요청" },
];

function kakaoText(text, quickReplies) {
  const template = { outputs: [{ simpleText: { text } }] };
  const qr = quickReplies === undefined ? QUICK_REPLIES : quickReplies;
  if (qr && qr.length) template.quickReplies = qr;
  return { version: "2.0", template };
}

// 링크 버튼이 달린 카드 (캘린더 연동 안내용)
function kakaoLinkCard(text, label, url) {
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          textCard: {
            text,
            buttons: [{ action: "webLink", label, webLinkUrl: url }],
          },
        },
      ],
    },
  };
}

// 카카오 사용자 id로 저장된 구글 토큰 조회 (멀티유저)
async function getUserToken(uid) {
  if (!uid) return null;
  const snap = await admin.firestore().collection("userTokens").doc(uid).get();
  return snap.exists ? snap.data() : null;
}

// "연동 해제" 의도
function isUnlinkIntent(text) {
  return /연동\s*해제|연동\s*끊|연결\s*끊|연결\s*해제|로그아웃|언링크/.test(text);
}

// ── 웹자보(행사 홍보 이미지) 생성 흐름 ─────────────────────────────────
const POSTER_WORKER_URL = `${AUTH_BASE}/posterWorker`;

function isPosterIntent(text) {
  return /웹\s*자보|행사\s*자보|자보\s*요청|자보\s*만들|포스터|홍보\s*(이미지|자보|물)/.test(
    text
  );
}

function isCancelIntent(text) {
  return /^(취소|그만|메뉴|처음|중단|닫기)$/.test(text.trim());
}

function isMenuIntent(text) {
  return /^(메뉴|도움말|시작|시작하기|help|모이다|안녕|안녕하세요|하이)$/i.test(
    text.trim()
  );
}

function menuReply() {
  return kakaoText(
    "안녕하세요! 의원실 비서 모이다예요 🤖\n무엇을 도와드릴까요?\n\n" +
      "· 일정 등록 → 그냥 일정을 말로 보내세요 (예: 내일 오후 3시 회의)\n" +
      "· 웹자보 → 아래 [🎨 웹자보 요청]\n" +
      "· 일정 확인 → [📅 오늘 일정]",
    [
      { label: "🎨 웹자보 요청", action: "message", messageText: "웹자보 요청" },
      { label: "📅 오늘 일정", action: "message", messageText: "오늘 일정은?" },
      { label: "📅 내일 일정", action: "message", messageText: "내일 일정은?" },
    ]
  );
}

// 대화 상태(웹자보 단계) 저장 — Firestore posterSessions/{uid}
const POSTER_SESSION_TTL = 30 * 60 * 1000; // 30분

async function getPosterSession(uid) {
  if (!uid) return null;
  const ref = admin.firestore().collection("posterSessions").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const d = snap.data();
  if (d.updatedAt && Date.now() - d.updatedAt > POSTER_SESSION_TTL) {
    await ref.delete();
    return null;
  }
  return d;
}

async function setPosterSession(uid, data) {
  if (!uid) return;
  await admin
    .firestore()
    .collection("posterSessions")
    .doc(uid)
    .set({ ...data, updatedAt: Date.now() }, { merge: true });
}

async function clearPosterSession(uid) {
  if (!uid) return;
  await admin.firestore().collection("posterSessions").doc(uid).delete();
}

// 카카오 스킬 페이로드 어디에 박혀 있든 사진 URL을 찾아낸다.
// ("이미지 보안 전송" 플러그인/첨부 등 전달 형식이 다양해 깊이 탐색)
function extractImageUrl(body) {
  const urls = [];
  const visit = (v) => {
    if (v == null) return;
    if (typeof v === "string") {
      const s = v.trim();
      if (s.startsWith("{") || s.startsWith("[")) {
        try {
          visit(JSON.parse(s));
          return;
        } catch (_) {
          /* 평범한 문자열로 처리 */
        }
      }
      const m = s.match(/https?:\/\/[^\s"'\\)]+/g);
      if (m) urls.push(...m);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (typeof v === "object") {
      Object.values(v).forEach(visit);
    }
  };
  visit(body);
  if (!urls.length) return null;

  const score = (u) => {
    let s = 0;
    if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(u)) s += 5;
    if (/(kakaocdn|kage|dn-|talkm|photo|image|img|media|secure|attach)/i.test(u))
      s += 3;
    if (
      /(callback|cloudfunctions|kauth|kapi|googleapis|oauth|calendar\.google|plus\.kakao)/i.test(
        u
      )
    )
      s -= 10;
    return s;
  };
  urls.sort((a, b) => score(b) - score(a));
  const best = urls[0];
  return best && score(best) >= 0 ? best : null;
}

// 사용자 연동 해제: 구글 권한 철회(best-effort) + 저장 토큰 삭제
async function unlinkUser(uid, refreshToken) {
  if (refreshToken) {
    try {
      await axios.post(
        "https://oauth2.googleapis.com/revoke",
        new URLSearchParams({ token: refreshToken }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 5000,
        }
      );
    } catch (_) {
      /* 이미 철회됐거나 실패해도 무시하고 저장본만 삭제 */
    }
  }
  await admin.firestore().collection("userTokens").doc(uid).delete();
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

async function parseSchedule(utterance, apiKey, opts = {}) {
  // 카카오 5초 제한에 맞춰 빠르게 실패하도록 타임아웃/재시도 최소화
  const clientOpts = { apiKey, timeout: 2500, maxRetries: 0 };
  if (opts.baseURL) clientOpts.baseURL = opts.baseURL;
  const client = new Anthropic(clientOpts);
  const today = nowInKST();

  const response = await client.messages.create({
    model: opts.model || "claude-haiku-4-5",
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

// ── 1-b) 규칙 기반 파서 (무료 백업: API 키 없거나 호출 실패 시) ───────────
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 한국 시각 기준 '지금' Date 객체
function kstDate() {
  const s = new Date().toLocaleString("en-US", { timeZone: TIMEZONE });
  return new Date(s);
}

// 일정 제목에서 날짜·시간·명령어 표현을 걷어내고 핵심만 남긴다
function cleanTitle(text) {
  let t = " " + text + " ";
  // 날짜 표현
  t = t.replace(/(\d{4})\s*년?\s*[.\-/]?\s*(\d{1,2})\s*월?\s*[.\-/]?\s*(\d{1,2})\s*일?/g, " ");
  t = t.replace(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/g, " ");
  t = t.replace(/(\d{1,2})\s*[/.\-]\s*(\d{1,2})/g, " ");
  t = t.replace(/(\d{1,2})\s*일(?![가-힣])/g, " ");
  // 시간 표현
  t = t.replace(/(\d{1,2})\s*:\s*(\d{2})/g, " ");
  t = t.replace(/(\d{1,2})\s*시\s*(반|\d{1,2}\s*분)?/g, " ");
  t = t.replace(/(\d{1,2})\s*분/g, " ");
  // 상대 날짜/시간대
  t = t.replace(/(다음\s*주|담주|이번\s*주|다음\s*달|이번\s*달)/g, " ");
  t = t.replace(/[일월화수목금토]요일/g, " ");
  t = t.replace(/오늘|내일|낼|모레|글피|오전|오후|저녁|밤|새벽|아침|점심|정오/g, " ");
  // 삭제/취소 의도 단어
  t = t.replace(/삭제|취소|지워\s*줘?|지우|없애\s*줘?|없애|제거|빼\s*줘|빼주/g, " ");
  // 명령형 동사 + 어미
  t = t.replace(/(등록|추가|저장|예약|입력|생성|세팅)\s*(좀)?\s*(해\s*주세요|해\s*줄래|해\s*줘요?|해\s*주라|해\s*도|하기|해요|해|좀|줘|주세요)?/g, " ");
  t = t.replace(/(잡아|넣어|적어|기록|세워|만들어)\s*(주세요|줘요?|둬|놔|주라|줄래)?/g, " ");
  t = t.replace(/(해\s*주세요|해\s*줄래|해\s*줘요?|해\s*주라|부탁\s*(해요|할게요?|드려요|해)?)/g, " ");
  t = t.replace(/일정|스케줄/g, " ");
  // 구두점 정리
  t = t.replace(/[.,!?~]+/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  // 말끝 표현(있어/예정/할거야 등) 반복 제거
  const tail =
    /(있어요?|있음|있다|있는데|잡혀\s*있어요?|이야|이에요|예요|예정(이야|이에요|입니다|임)?|할\s*거(야|에요)?|할게요?|할께요?|해야\s*(돼|해|함)|하려고|하기로|함|좀|줘|요|을|를|이|가|은|는)\s*$/;
  for (let i = 0; i < 5 && tail.test(t); i++) t = t.replace(tail, "").trim();
  return t;
}

// 삭제 의도인지 판별
function isDeleteIntent(text) {
  return /삭제|취소|지워|지우|없애|제거|빼\s*줘|빼주/.test(text);
}

// 의도 판별: 삭제 > 조회 > 등록
function detectIntent(text) {
  if (isDeleteIntent(text)) return "delete";
  const hasCreateVerb = /등록|추가|저장|예약|입력|생성|잡아|넣어|세팅/.test(text);
  const hasListMarker =
    /보여|알려|뭐\s*있|뭐있|무슨\s*일정|일정\s*은|일정\s*있|일정\s*뭐|일정\s*목록|일정\s*리스트|스케줄\s*은|확인|조회|뭐가\s*있|있나|일정\?|일정은\?/.test(
      text
    );
  if (hasListMarker && !hasCreateVerb) return "list";
  return "create";
}

function parseScheduleRuleBased(utterance) {
  const text = utterance.trim();
  const base = kstDate();
  base.setHours(0, 0, 0, 0);
  let date = new Date(base);
  let matchedDate = false;

  // 상대 날짜
  if (/오늘/.test(text)) {
    matchedDate = true;
  } else if (/모레/.test(text)) {
    date.setDate(date.getDate() + 2);
    matchedDate = true;
  } else if (/내일|낼/.test(text)) {
    date.setDate(date.getDate() + 1);
    matchedDate = true;
  }

  // "다음주 월요일" / "이번주 금요일" / "월요일"
  const wdMatch = text.match(/(다음\s*주|담주|이번\s*주)?\s*([일월화수목금토])요일/);
  if (wdMatch) {
    const targetWd = WEEKDAYS.indexOf(wdMatch[2]); // 일=0
    const qualifier = wdMatch[1] || "";
    const nextWeek = /다음\s*주|담주/.test(qualifier);
    const thisWeek = /이번\s*주/.test(qualifier);
    const d = new Date(base);
    if (nextWeek || thisWeek) {
      // 월요일 시작 주 기준으로 해당 요일 계산
      const dow = d.getDay(); // 0=일..6=토
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(d);
      monday.setDate(d.getDate() + mondayOffset);
      const targetPos = targetWd === 0 ? 6 : targetWd - 1; // 월=0..일=6
      monday.setDate(monday.getDate() + targetPos + (nextWeek ? 7 : 0));
      date = monday;
    } else {
      // 수식어 없는 "금요일" = 다가오는 가장 가까운 그 요일
      const diff = (targetWd - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + diff);
      date = d;
    }
    matchedDate = true;
  }

  // 절대 날짜 "6/25", "6월 25일", "2026-06-25"
  let m = text.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) {
    date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    matchedDate = true;
  } else {
    m = text.match(/(\d{1,2})\s*[월./\-]\s*(\d{1,2})\s*일?/);
    if (m) {
      const mon = Number(m[1]) - 1;
      const day = Number(m[2]);
      const y = base.getFullYear();
      let cand = new Date(y, mon, day);
      // 이미 지난 날짜면 내년으로
      if (cand < base) cand = new Date(y + 1, mon, day);
      date = cand;
      matchedDate = true;
    }
  }

  // 시간 파싱: "오후 3시", "15시", "14:30", "저녁 7시"
  let startTime = null;
  let allDay = false;
  let hour = null;
  let minute = 0;

  let t = text.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (t) {
    hour = Number(t[1]);
    minute = Number(t[2]);
  } else {
    t = text.match(/(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분|반)?/);
    if (t) {
      hour = Number(t[1]);
      if (/반/.test(t[0])) minute = 30;
      else if (t[2]) minute = Number(t[2]);
    }
  }

  if (hour !== null) {
    const isPM = /오후|저녁|밤|점심/.test(text);
    const isAM = /오전|아침|새벽/.test(text);
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
    // 오전/오후 표기 없고 1~7시면 통상 오후로 추정(아침 일정은 보통 명시)
    if (!isPM && !isAM && hour >= 1 && hour <= 7) hour += 12;
    startTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  } else {
    // 시간 표현이 전혀 없으면 종일 일정으로
    allDay = true;
  }

  // 제목: 날짜/시간/명령어 표현을 걷어낸 나머지
  let title = cleanTitle(text);
  if (!title) title = "일정";

  return {
    // 날짜나 시간 단서가 하나도 없으면 일정이 아님(인사/잡담 등)
    is_schedule: matchedDate || startTime !== null,
    intent: detectIntent(text),
    title,
    date: ymd(date),
    start_time: startTime,
    end_time: null,
    all_day: allDay,
    location: null,
    description: null,
  };
}

// 규칙 기반을 우선 사용(빠름 → 카카오 5초 제한에 안전).
// AI 파싱은 opts.useAI 가 켜졌을 때만 시도하고, 실패하면 즉시 규칙 기반으로 폴백.
async function parse(utterance, apiKey, opts) {
  if (apiKey && opts && opts.useAI) {
    try {
      return await parseSchedule(utterance, apiKey, opts);
    } catch (e) {
      console.warn("AI 파싱 실패 → 규칙 기반 폴백:", e.message);
    }
  }
  return parseScheduleRuleBased(utterance);
}

// ── 2) 구글 캘린더에 일정 등록 ──────────────────────────────────────────
function buildCalendarClient(creds) {
  const oauth2 = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
  oauth2.setCredentials({ refresh_token: creds.refreshToken });
  return google.calendar({ version: "v3", auth: oauth2 });
}

// 특정 날짜(YYYY-MM-DD)의 일정을 시간순으로 가져온다 (알림/조회 공용)
async function getEventsForDate(dateStr, creds) {
  const calendar = buildCalendarClient(creds);
  const tz = "+09:00"; // KST
  const res = await calendar.events.list({
    calendarId: creds.calendarId || "primary",
    timeMin: `${dateStr}T00:00:00${tz}`,
    timeMax: `${dateStr}T23:59:59${tz}`,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });
  return res.data.items || [];
}

// 이벤트 시작 시각을 "HH:MM" 또는 "종일"로
function eventTimeLabel(ev) {
  if (ev.start && ev.start.date) return "종일";
  const m = ((ev.start && ev.start.dateTime) || "").match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
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

// ── 2-b) 일정 삭제 ─────────────────────────────────────────────────────
async function deleteEvents(parsed, creds) {
  const calendar = buildCalendarClient(creds);
  const tz = "+09:00"; // KST
  const timeMin = `${parsed.date}T00:00:00${tz}`;
  const timeMax = `${parsed.date}T23:59:59${tz}`;

  const list = await calendar.events.list({
    calendarId: creds.calendarId || "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  let items = list.data.items || [];

  // 제목 키워드로 좁히기 (제목이 의미 있을 때만)
  const kw = (parsed.title || "").trim();
  if (kw && kw !== "일정") {
    const matched = items.filter(
      (ev) =>
        (ev.summary || "").includes(kw) || kw.includes(ev.summary || "")
    );
    if (matched.length) items = matched;
  }

  // 시간이 지정됐고 후보가 여러 개면 그 시각만 남기기
  if (parsed.start_time && items.length > 1) {
    const near = items.filter((ev) => {
      const s = (ev.start && (ev.start.dateTime || ev.start.date)) || "";
      return s.includes("T" + parsed.start_time);
    });
    if (near.length) items = near;
  }

  const deleted = [];
  for (const ev of items) {
    await calendar.events.delete({
      calendarId: creds.calendarId || "primary",
      eventId: ev.id,
    });
    deleted.push(ev.summary || "(제목 없음)");
  }
  return deleted;
}

function deleteText(parsed, deletedTitles) {
  const weekday = new Date(parsed.date + "T00:00:00").toLocaleDateString(
    "ko-KR",
    { weekday: "short" }
  );
  if (!deletedTitles.length) {
    return (
      `🔍 ${parsed.date} (${weekday})에서 ` +
      `"${parsed.title}" 일정을 못 찾았어요.\n` +
      `정확한 날짜와 제목으로 다시 알려주세요.`
    );
  }
  if (deletedTitles.length === 1) {
    return `🗑️ 삭제했어요!\n\n📌 ${deletedTitles[0]}\n🕒 ${parsed.date} (${weekday})`;
  }
  const listStr = deletedTitles.map((t) => `· ${t}`).join("\n");
  return `🗑️ ${deletedTitles.length}건 삭제했어요!\n\n${listStr}\n🕒 ${parsed.date} (${weekday})`;
}

// ── 2-c) 일정 조회 ─────────────────────────────────────────────────────
async function listEvents(parsed, creds) {
  return getEventsForDate(parsed.date, creds);
}

function listText(parsed, items) {
  const weekday = new Date(parsed.date + "T00:00:00").toLocaleDateString(
    "ko-KR",
    { weekday: "short" }
  );
  const header = `📅 ${parsed.date} (${weekday}) 일정`;
  if (!items.length) return `${header}\n\n등록된 일정이 없어요. 😌`;
  const lines = items.map((ev) => {
    let time;
    if (ev.start && ev.start.date) {
      time = "종일";
    } else {
      const m = ((ev.start && ev.start.dateTime) || "").match(/T(\d{2}):(\d{2})/);
      time = m ? `${m[1]}:${m[2]}` : "";
    }
    return `🕒 ${time}  ${ev.summary || "(제목 없음)"}`;
  });
  return `${header} (${items.length}건)\n\n${lines.join("\n")}`;
}

// ── 3) 카카오 i 오픈빌더 스킬 웹훅 ──────────────────────────────────────
exports.kakaoSkill = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 15,
    // 카카오는 5초 안에 응답을 받아야 함. 인스턴스 1개를 항상 켜둬서 cold start로
    // 응답이 늦어 답장이 안 뜨는 문제를 방지(소액 비용 발생, 0으로 바꾸면 무료).
    minInstances: 1,
    memory: "256MiB",
    secrets: [
      ANTHROPIC_API_KEY,
      ANTHROPIC_BASE_URL,
      ANTHROPIC_MODEL,
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

      // 멀티유저: 카카오 사용자별로 본인 구글 캘린더 연동 토큰을 사용
      const uid =
        req.body &&
        req.body.userRequest &&
        req.body.userRequest.user &&
        req.body.userRequest.user.id
          ? String(req.body.userRequest.user.id)
          : "";
      const userToken = await getUserToken(uid);

      // 연동 해제 명령
      if (isUnlinkIntent(utterance)) {
        if (userToken) await unlinkUser(uid, userToken.refreshToken);
        return res.json(
          kakaoText(
            "🔌 캘린더 연동을 해제했어요.\n다시 사용하려면 아무 메시지나 보내서 연동하면 됩니다."
          )
        );
      }

      // ── 웹자보 생성 흐름 (구글 캘린더 연동 불필요) ──────────────────
      const posterSession = await getPosterSession(uid);

      // (1) 웹자보 시작
      if (isPosterIntent(utterance)) {
        await setPosterSession(uid, { step: "await_photo" });
        return res.json(
          kakaoText(
            "🎨 행사 웹자보를 만들어 드릴게요!\n\n먼저 행사 사진을 1장 보내주세요 📷",
            [{ label: "취소", action: "message", messageText: "취소" }]
          )
        );
      }

      // (2) 진행 중 세션 처리
      if (posterSession) {
        if (isCancelIntent(utterance)) {
          await clearPosterSession(uid);
          return res.json(menuReply());
        }

        if (posterSession.step === "await_photo") {
          const imageUrl = extractImageUrl(req.body);
          console.log(
            "poster await_photo extracted:",
            imageUrl,
            "| body:",
            JSON.stringify(req.body).slice(0, 1000)
          );
          if (imageUrl) {
            await setPosterSession(uid, { step: "await_brief", imageUrl });
            return res.json(
              kakaoText(
                "사진 받았어요! 📷\n\n이제 행사 요지를 적어주세요.\n행사명·일시·장소·내용을 자유롭게 적어주시면 됩니다.\n\n예) 청년 일자리 간담회 / 7월 3일(목) 오후 2시 / 국회의원회관 제2세미나실 / 청년 정책 현장 의견 청취",
                [{ label: "취소", action: "message", messageText: "취소" }]
              )
            );
          }
          return res.json(
            kakaoText(
              "사진이 아직 안 보여요 😅\n행사 사진을 첨부해서 한 장 보내주세요 📷",
              [{ label: "취소", action: "message", messageText: "취소" }]
            )
          );
        }

        if (posterSession.step === "await_brief") {
          const brief = utterance;
          if (!brief || brief.length < 3) {
            return res.json(
              kakaoText(
                "행사 요지를 조금만 더 적어주세요 🙏\n(행사명·일시·장소·내용)"
              )
            );
          }
          const callbackUrl =
            (req.body &&
              req.body.userRequest &&
              req.body.userRequest.callbackUrl) ||
            "";
          // 워커를 깨우고(완료까지 대기하지 않음) 즉시 콜백 대기 응답
          try {
            await axios.post(
              POSTER_WORKER_URL,
              { callbackUrl, imageUrl: posterSession.imageUrl, brief },
              { timeout: 1500 }
            );
          } catch (_) {
            /* 타임아웃은 정상: 워커는 백그라운드로 계속 실행됨 */
          }
          await clearPosterSession(uid);

          if (callbackUrl) {
            return res.json({
              version: "2.0",
              useCallback: true,
              data: { text: "자보 만드는 중이에요… ⏳ (최대 1분)" },
            });
          }
          return res.json(
            kakaoText(
              "자보 생성을 시작했어요! ⏳\n곧 결과를 보내드릴게요.\n(결과가 안 오면 오픈빌더 '콜백' 설정을 확인해 주세요)"
            )
          );
        }
      }

      // 메뉴/인사
      if (isMenuIntent(utterance)) {
        return res.json(menuReply());
      }

      if (!userToken || !userToken.refreshToken) {
        const linkUrl = `${AUTH_BASE}/googleAuthStart?uid=${encodeURIComponent(uid)}`;
        return res.json(
          kakaoLinkCard(
            "먼저 내 구글 캘린더를 연동해주세요. 🔗\n아래 버튼을 눌러 1회만 연동하면, 이후엔 본인 캘린더에 일정이 등록돼요.",
            "내 캘린더 연동하기",
            linkUrl
          )
        );
      }

      // 1) 파싱 (AI 우선, 실패 시 규칙 기반 자동 폴백)
      const apiKey = optionalSecret(ANTHROPIC_API_KEY);
      const parsed = await parse(utterance, apiKey, {
        baseURL: optionalSecret(ANTHROPIC_BASE_URL),
        model: optionalSecret(ANTHROPIC_MODEL),
      });

      // 의도 판별 (AI 경로엔 intent가 없을 수 있어 보강)
      const intent = parsed.intent || detectIntent(utterance);

      const creds = {
        clientId: GOOGLE_CLIENT_ID.value(),
        clientSecret: GOOGLE_CLIENT_SECRET.value(),
        refreshToken: userToken.refreshToken,
        calendarId: userToken.calendarId || "primary",
      };

      // 조회: 날짜 없으면 오늘 기준 (is_schedule 체크 전에 처리)
      if (intent === "list") {
        const items = await listEvents(parsed, creds);
        return res.json(kakaoText(listText(parsed, items)));
      }

      if (!parsed.is_schedule) {
        return res.json(
          kakaoText(
            intent === "delete"
              ? "삭제할 일정을 날짜와 함께 알려주세요.\n예) 6월 27일 치과 삭제"
              : "일정으로 등록할 내용을 알려주세요.\n예) 다음 주 금요일 점심 약속, 6월 25일 휴가"
          )
        );
      }

      // 2) 삭제 또는 등록
      if (intent === "delete") {
        const deleted = await deleteEvents(parsed, creds);
        return res.json(kakaoText(deleteText(parsed, deleted)));
      }

      const eventData = await createEvent(parsed, creds);
      return res.json(kakaoText(confirmText(parsed, eventData)));
    } catch (e) {
      console.error("kakaoSkill error:", e);
      // 토큰 만료/철회 → 저장본 삭제하고 재연동 안내
      const isInvalidGrant =
        (e && /invalid_grant/.test(e.message || "")) ||
        (e &&
          e.response &&
          e.response.data &&
          e.response.data.error === "invalid_grant");
      if (isInvalidGrant) {
        const uid2 =
          (req.body &&
            req.body.userRequest &&
            req.body.userRequest.user &&
            req.body.userRequest.user.id &&
            String(req.body.userRequest.user.id)) ||
          "";
        try {
          await admin.firestore().collection("userTokens").doc(uid2).delete();
        } catch (_) {}
        const linkUrl = `${AUTH_BASE}/googleAuthStart?uid=${encodeURIComponent(uid2)}`;
        return res.json(
          kakaoLinkCard(
            "연동이 만료됐거나 해제됐어요. 다시 연동해주세요. 🔗",
            "내 캘린더 다시 연동하기",
            linkUrl
          )
        );
      }
      return res.json(
        kakaoText(
          "처리 중 문제가 생겼어요 😢\n잠시 후 다시 시도하거나 표현을 바꿔서 입력해 주세요."
        )
      );
    }
  }
);

// 알림 모듈에서 재사용할 헬퍼 내보내기
module.exports.getEventsForDate = getEventsForDate;
module.exports.eventTimeLabel = eventTimeLabel;
