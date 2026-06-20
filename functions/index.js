const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");
const Anthropic = require("@anthropic-ai/sdk");

// AI 문구 생성에 쓰는 Claude API 키 (Secret Manager 에 보관)
//   설정:  firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

admin.initializeApp();
const db = admin.firestore();

const BASE_URL = "https://theminjoo.kr";
const LIST_URL = BASE_URL + "/main/sub/news/list.php?brd=1";

async function crawlMinjoo() {
  const res = await axios.get(LIST_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
    timeout: 15000,
    responseType: "arraybuffer",
  });

  const html = new TextDecoder("utf-8").decode(res.data);
  const $ = cheerio.load(html);
  const notices = [];

  $(".board_list tbody tr, .bbs_list tbody tr, table tbody tr, .list_item, .news_list li, ul.list > li").each(function (i) {
    if (i >= 30) return false;
    const $row = $(this);
    let title = "", link = "", date = "", no = "";

    const $a = $row.find("a").first();
    if ($a.length) {
      title = $a.text().trim().replace(/\s+/g, " ");
      const href = $a.attr("href");
      if (href) {
        link = href.startsWith("http") ? href : BASE_URL + (href.startsWith("/") ? "" : "/") + href;
      }
    }

    $row.find("td, span, div").each(function () {
      const txt = $(this).text().trim();
      if (/^\d{4}[.\-/]\d{2}[.\-/]\d{2}$/.test(txt)) {
        date = txt.replace(/\./g, "-");
      }
      if (!no && /^\d+$/.test(txt) && parseInt(txt) > 0) {
        no = txt;
      }
    });

    if (title && title.length > 1) {
      notices.push({ no, title, link, date, source: "민주당 중앙당" });
    }
  });

  return notices;
}

async function saveNotices(notices) {
  const batch = db.batch();
  for (const n of notices) {
    const id = "minjoo_" + (n.no || n.title.slice(0, 20).replace(/[^가-힣a-zA-Z0-9]/g, ""));
    const ref = db.collection("party_notices").doc(id);
    batch.set(ref, { ...n, id, updated: Date.now() }, { merge: true });
  }
  await batch.commit();
  return notices.length;
}

// 1시간마다 자동 크롤링
exports.crawlPartyNotices = onSchedule(
  { schedule: "every 60 minutes", region: "asia-northeast3", timeoutSeconds: 60 },
  async () => {
    const notices = await crawlMinjoo();
    const count = await saveNotices(notices);
    console.log(`Crawled ${count} notices from minjoo`);
  }
);

// 수동 트리거 (테스트용)
exports.crawlNow = onRequest({ region: "asia-northeast3", cors: true }, async (req, res) => {
  try {
    const notices = await crawlMinjoo();
    const count = await saveNotices(notices);
    res.json({ success: true, count, sample: notices.slice(0, 3) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== 웹자보 AI 문구 생성 =====
// 정치인이 보낸 내용을 받아서 자보용 슬로건/제목/핵심문구를 만들어 돌려준다.
// API 키는 서버(Secret)에만 두고, 프론트(poster.html)는 이 함수만 호출한다.
exports.generatePosterCopy = onRequest(
  { region: "asia-northeast3", cors: true, secrets: [ANTHROPIC_API_KEY] },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST 요청만 지원합니다." });
    }

    try {
      const {
        name = "",        // 정치인 이름
        position = "",     // 직함 (예: ○○시 시의원 예비후보)
        content = "",      // 전달받은 내용 (활동/공약/소식 등)
        tone = "정중하고 신뢰감 있는", // 말투
      } = req.body || {};

      if (!content.trim()) {
        return res.status(400).json({ error: "내용(content)을 입력해 주세요." });
      }

      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

      const prompt =
        `너는 한국 정치인의 웹자보(온라인 홍보 이미지) 문구를 만드는 카피라이터다.\n` +
        `아래 정보를 바탕으로 자보에 들어갈 문구를 작성해라.\n\n` +
        `- 이름: ${name || "(미정)"}\n` +
        `- 직함: ${position || "(미정)"}\n` +
        `- 말투: ${tone}\n` +
        `- 전달받은 내용:\n${content}\n\n` +
        `다음 JSON 형식으로만 답하라. 다른 설명·마크다운 코드블록 없이 JSON 객체 하나만 출력한다:\n` +
        `{\n` +
        `  "headline": "한눈에 들어오는 6~14자 핵심 슬로건",\n` +
        `  "subheadline": "headline을 보조하는 한 줄 (15~30자)",\n` +
        `  "points": ["핵심 메시지 2~3개", "각 8~20자"],\n` +
        `  "closing": "마무리 한 줄 (인사/다짐, 12~25자)"\n` +
        `}\n\n` +
        `과장·허위 표현은 피하고, 선거법에 문제될 단정적 표현은 쓰지 마라.`;

      const response = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      const raw = (textBlock && textBlock.text) || "";
      // 혹시 코드블록/설명이 섞여 와도 JSON 객체만 안전하게 추출
      const match = raw.match(/\{[\s\S]*\}/);
      const data = JSON.parse(match ? match[0] : raw);
      if (!Array.isArray(data.points)) data.points = [];
      res.json({ success: true, copy: data });
    } catch (e) {
      console.error("generatePosterCopy 실패:", e);
      res.status(500).json({ error: e.message || "문구 생성 중 오류가 발생했습니다." });
    }
  }
);
