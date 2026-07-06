const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

// 한국(KST) 기준 오늘 날짜 (YYYY-MM-DD)
function todayKST() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// 봇 활동 1건을 관제탑에 보고한다.
//   botId : "moida-schedule" 처럼 봇 식별자
//   opts  : { kind:"create|list|delete|poster|link|briefing|calc|error",
//             event:"화면에 표시할 짧은 문구", cost:숫자(선택) }
//
// ※ 이 함수는 절대 봇 본연의 기능을 방해하지 않는다. 어떤 이유로 실패해도
//    조용히 무시(로그만)하고 넘어간다. 그래서 안심하고 await 해도 된다.
async function report(botId, opts = {}) {
  try {
    if (!botId) return;
    const kind = opts.kind || "use";
    const now = Date.now();
    const day = todayKST();
    const inc = admin.firestore.FieldValue.increment(1);
    const db = admin.firestore();

    const patch = {
      botId,
      lastActiveAt: now,
      lastKind: kind,
      todayDate: day,
      daily: {
        [day]: { [kind]: inc, total: inc },
      },
    };
    if (opts.cost) {
      patch.daily[day].cost = admin.firestore.FieldValue.increment(opts.cost);
    }
    await db.collection("botStats").doc(botId).set(patch, { merge: true });

    if (opts.event) {
      await db.collection("botEvents").add({
        botId,
        kind,
        text: String(opts.event).slice(0, 120),
        at: now,
      });
    }
  } catch (e) {
    console.warn("botReport 실패(무시):", botId, e && e.message);
  }
}

module.exports = { report, todayKST };
