const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const { todayKST } = require("./botReport");

if (!admin.apps.length) admin.initializeApp();

// ── 팀 / 봇 구성 (새 봇·팀 추가 시 여기만 수정하면 됨) ───────────────────
const REGISTRY = {
  teams: [
    { id: "moida", name: "모이다팀", color: "#4C9BFF" },
    { id: "leather", name: "가죽공예팀", color: "#D6A263" },
  ],
  bots: [
    { id: "moida-schedule", team: "moida", name: "모이다 일정봇", icon: "📅", desc: "카톡 → 구글 캘린더 비서" },
    { id: "leather-cost", team: "leather", name: "가죽공예 원가봇", icon: "🧵", desc: "S/F·부위별 원가 계산" },
  ],
};

// 활동 1건당 대략 추정 비용(원). ※ 실제 청구액이 아니라 사용량 기반 추정치.
//   규칙기반 처리(등록/조회/삭제 등)는 AI를 안 써서 거의 0, 웹자보만 AI로 비용 발생.
const UNIT_COST_KRW = {
  create: 1, list: 1, delete: 1, link: 1, briefing: 1, use: 1, calc: 0, error: 0,
  poster: 120, // GPT 문구 + 이미지 생성 + 렌더링 대략
};
function estCost(today) {
  let sum = 0;
  for (const k in UNIT_COST_KRW) sum += (today[k] || 0) * UNIT_COST_KRW[k];
  return Math.round(sum);
}

// 활동 시각 → 상태 판정
function statusOf(secs) {
  if (secs === null) return "idle";
  if (secs < 120) return "active";       // 2분 내 활동 = 작동중
  if (secs < 24 * 3600) return "idle";   // 하루 내 = 대기(정상)
  return "stale";                        // 하루+ 무응답 = 응답없음
}

async function buildData() {
  const db = admin.firestore();
  const day = todayKST();
  const now = Date.now();

  // 봇별 통계
  const statsById = {};
  try {
    const snap = await db.collection("botStats").get();
    snap.forEach((s) => (statsById[s.id] = s.data()));
  } catch (_) {}

  // 모이다 연동 사용자 수
  let moidaUsers = null;
  try {
    const c = await db.collection("userTokens").count().get();
    moidaUsers = c.data().count;
  } catch (_) {}

  // 최근 활동 이벤트
  let events = [];
  try {
    const ev = await db.collection("botEvents").orderBy("at", "desc").limit(18).get();
    events = ev.docs.map((d) => d.data());
  } catch (_) {}

  const bots = REGISTRY.bots.map((b) => {
    const st = statsById[b.id] || {};
    const today = (st.daily && st.daily[day]) || {};
    const last = st.lastActiveAt || 0;
    const secs = last ? Math.round((now - last) / 1000) : null;
    return {
      id: b.id,
      team: b.team,
      name: b.name,
      icon: b.icon,
      desc: b.desc,
      users: b.id === "moida-schedule" ? moidaUsers : (st.users != null ? st.users : null),
      today: {
        total: today.total || 0,
        create: today.create || 0,
        list: today.list || 0,
        delete: today.delete || 0,
        poster: today.poster || 0,
        link: today.link || 0,
        briefing: today.briefing || 0,
        calc: today.calc || 0,
        error: today.error || 0,
      },
      costToday: today.cost || 0,
      costEst: today.cost ? Math.round(today.cost) : estCost(today),
      lastActiveAt: last,
      secondsSinceActive: secs,
      status: statusOf(secs),
    };
  });

  return { now, day, teams: REGISTRY.teams, bots, events };
}

// ── 대시보드: 페이지(HTML) + 데이터(JSON) 한 함수로 ──────────────────────
exports.dashboard = onRequest(
  { region: "asia-northeast3", cors: true, memory: "256MiB" },
  async (req, res) => {
    // ?data=1 → JSON 데이터
    if (req.query.data) {
      try {
        const data = await buildData();
        res.set("Cache-Control", "no-store");
        return res.json(data);
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }
    // 그 외 → 대시보드 페이지
    try {
      const html = fs.readFileSync(path.join(__dirname, "dashboardPage.html"), "utf8");
      res.set("Content-Type", "text/html; charset=utf-8");
      res.set("Cache-Control", "no-store");
      return res.send(html);
    } catch (e) {
      return res.status(500).send("dashboard page load error: " + e.message);
    }
  }
);

// ── 클라이언트(정적 웹) 봇용 활동 신호 수신 ──────────────────────────────
// 예: 가죽공예 원가봇(leather-cost.html)이 계산할 때마다 여기로 핑을 보냄.
//   GET/POST /botPing?bot=leather-cost&kind=calc&event=원가계산
exports.botPing = onRequest(
  { region: "asia-northeast3", cors: true },
  async (req, res) => {
    try {
      const q = { ...req.query, ...(req.body || {}) };
      const botId = String(q.bot || "").trim();
      const allowed = REGISTRY.bots.map((b) => b.id);
      if (!allowed.includes(botId)) {
        return res.status(400).json({ ok: false, error: "unknown bot" });
      }
      const { report } = require("./botReport");
      await report(botId, {
        kind: String(q.kind || "use"),
        event: q.event ? String(q.event) : undefined,
      });
      res.set("Cache-Control", "no-store");
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);
