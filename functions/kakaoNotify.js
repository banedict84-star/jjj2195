const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");
const { getEventsForDate, eventTimeLabel } = require("./kakaoCalendar");

if (!admin.apps.length) admin.initializeApp();

const TIMEZONE = "Asia/Seoul";

// 구글 캘린더 시크릿
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");
const GOOGLE_REFRESH_TOKEN = defineSecret("GOOGLE_REFRESH_TOKEN");
const GOOGLE_CALENDAR_ID = defineSecret("GOOGLE_CALENDAR_ID");
// 카카오 "나에게 보내기"용 시크릿
const KAKAO_REST_API_KEY = defineSecret("KAKAO_REST_API_KEY");
const KAKAO_REFRESH_TOKEN = defineSecret("KAKAO_REFRESH_TOKEN");
const KAKAO_CLIENT_SECRET = defineSecret("KAKAO_CLIENT_SECRET");

const CAL_LINK = "https://calendar.google.com/calendar";

function googleCreds() {
  return {
    clientId: GOOGLE_CLIENT_ID.value(),
    clientSecret: GOOGLE_CLIENT_SECRET.value(),
    refreshToken: GOOGLE_REFRESH_TOKEN.value(),
    calendarId: GOOGLE_CALENDAR_ID.value(),
  };
}

// 한국 시각 기준 현재 Date
function kstNow() {
  const s = new Date().toLocaleString("en-US", { timeZone: TIMEZONE });
  return new Date(s);
}

function ymdKST(d) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(d); // YYYY-MM-DD
}

function weekdayKo(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("ko-KR", {
    weekday: "short",
  });
}

// ── 카카오 "나에게 보내기" ──────────────────────────────────────────────
async function getKakaoAccessToken() {
  const rk = (KAKAO_REST_API_KEY.value() || "").trim();
  const rt = (KAKAO_REFRESH_TOKEN.value() || "").trim();
  const body = {
    grant_type: "refresh_token",
    client_id: rk,
    refresh_token: rt,
  };
  // 클라이언트 시크릿 활성화(ON) 시 함께 보내야 함
  let csLen = 0;
  try {
    const cs = (KAKAO_CLIENT_SECRET.value() || "").trim();
    if (cs && cs.length) {
      body.client_secret = cs;
      csLen = cs.length;
    }
  } catch (_) {}
  console.log(`kakao refresh params -> RK:${rk.length} RT:${rt.length} CS:${csLen}`);
  const res = await axios.post(
    "https://kauth.kakao.com/oauth/token",
    new URLSearchParams(body),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 8000 }
  );
  return res.data.access_token;
}

async function sendKakaoMemo(text, linkUrl) {
  const accessToken = await getKakaoAccessToken();
  const templateObject = {
    object_type: "text",
    text,
    link: {
      web_url: linkUrl || CAL_LINK,
      mobile_web_url: linkUrl || CAL_LINK,
    },
    button_title: "캘린더 열기",
  };
  await axios.post(
    "https://kapi.kakao.com/v2/api/talk/memo/default/send",
    new URLSearchParams({ template_object: JSON.stringify(templateObject) }),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 8000,
    }
  );
}

// ── 아침 브리핑 (매일 오전 7시) ─────────────────────────────────────────
exports.morningBriefing = onSchedule(
  {
    schedule: "0 7 * * *",
    timeZone: TIMEZONE,
    region: "asia-northeast3",
    timeoutSeconds: 30,
    secrets: [
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REFRESH_TOKEN,
      GOOGLE_CALENDAR_ID,
      KAKAO_REST_API_KEY,
      KAKAO_REFRESH_TOKEN,
      KAKAO_CLIENT_SECRET,
    ],
  },
  async () => {
    const today = ymdKST(kstNow());
    const items = await getEventsForDate(today, googleCreds());

    let text;
    const head = `🌅 좋은 아침입니다!\n${today} (${weekdayKo(today)})`;
    if (!items.length) {
      text = `${head}\n\n오늘은 등록된 일정이 없습니다. 좋은 하루 되세요! 😊`;
    } else {
      const lines = items
        .map((ev) => `🕒 ${eventTimeLabel(ev)}  ${ev.summary || "(제목 없음)"}`)
        .join("\n");
      text = `${head}\n\n오늘 일정 ${items.length}건\n\n${lines}`;
    }
    try {
      await sendKakaoMemo(text);
      console.log("morningBriefing sent:", items.length, "events");
    } catch (e) {
      const detail = e.response ? JSON.stringify(e.response.data) : e.message;
      console.error("morningBriefing kakao send FAILED:", detail);
      throw e;
    }
  }
);

// ── 일정 30분 전 리마인더 (15분마다 체크) ──────────────────────────────
exports.eventReminder = onSchedule(
  {
    schedule: "*/15 * * * *",
    timeZone: TIMEZONE,
    region: "asia-northeast3",
    timeoutSeconds: 30,
    secrets: [
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REFRESH_TOKEN,
      GOOGLE_CALENDAR_ID,
      KAKAO_REST_API_KEY,
      KAKAO_REFRESH_TOKEN,
      KAKAO_CLIENT_SECRET,
    ],
  },
  async () => {
    const now = kstNow();
    const today = ymdKST(now);
    const items = await getEventsForDate(today, googleCreds());
    const db = admin.firestore();

    for (const ev of items) {
      if (!ev.start || !ev.start.dateTime) continue; // 종일 일정 제외
      const start = new Date(ev.start.dateTime);
      const diffMin = (start.getTime() - now.getTime()) / 60000;
      if (diffMin < 25 || diffMin > 40) continue; // 약 30분 전 구간만

      const dedupId = `${today}_${ev.id}`;
      const ref = db.collection("sentReminders").doc(dedupId);
      const snap = await ref.get();
      if (snap.exists) continue; // 이미 보냄

      const mins = Math.round(diffMin);
      let text = `⏰ 곧 일정이 있어요!\n\n📌 ${ev.summary || "(제목 없음)"}\n🕒 ${eventTimeLabel(
        ev
      )} (약 ${mins}분 후)`;
      if (ev.location) text += `\n📍 ${ev.location}`;

      await sendKakaoMemo(text, ev.htmlLink);
      await ref.set({ sentAt: Date.now(), date: today, summary: ev.summary || "" });
      console.log("reminder sent:", ev.summary, mins, "min");
    }
  }
);

// ── 동기 테스트: 토큰 갱신 + 메모 발송 결과를 즉시 JSON으로 반환 ──────────
exports.testKakao = onRequest(
  {
    region: "asia-northeast3",
    secrets: [KAKAO_REST_API_KEY, KAKAO_REFRESH_TOKEN, KAKAO_CLIENT_SECRET],
  },
  async (req, res) => {
    const rk = (KAKAO_REST_API_KEY.value() || "").trim();
    const rt = (KAKAO_REFRESH_TOKEN.value() || "").trim();
    const cs = (KAKAO_CLIENT_SECRET.value() || "").trim();
    const lens = { rk: rk.length, rt: rt.length, cs: cs.length };
    try {
      const tok = await axios.post(
        "https://kauth.kakao.com/oauth/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: rk,
          refresh_token: rt,
          client_secret: cs,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 8000 }
      );
      const at = tok.data.access_token;
      await axios.post(
        "https://kapi.kakao.com/v2/api/talk/memo/default/send",
        new URLSearchParams({
          template_object: JSON.stringify({
            object_type: "text",
            text: "✅ 모이다 테스트 메시지입니다. 이게 보이면 아침 브리핑도 작동해요!",
            link: { web_url: CAL_LINK, mobile_web_url: CAL_LINK },
          }),
        }),
        {
          headers: {
            Authorization: `Bearer ${at}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 8000,
        }
      );
      res.json({ ok: true, lens, message: "memo sent" });
    } catch (e) {
      res.json({
        ok: false,
        lens,
        step: e.config && e.config.url,
        status: e.response && e.response.status,
        data: e.response && e.response.data,
        msg: e.message,
      });
    }
  }
);
