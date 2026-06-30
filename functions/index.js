const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");

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

// ---------------------------------------------------------------------------
// SMMKings API 프록시
// ---------------------------------------------------------------------------
// API 키는 절대 프론트엔드(HTML)에 노출하지 않고, Firebase Secret 으로 보관한다.
// 설정:  firebase functions:secrets:set SMMKINGS_API_KEY
// 프론트엔드는 이 함수만 호출하고, 함수가 키를 붙여 SMMKings 로 중계한다.
const SMMKINGS_API_KEY = defineSecret("SMMKINGS_API_KEY");
const SMM_API_URL = "https://smmkings.com/api/v2";

// 허용된 action 만 통과시킨다 (임의 호출 방지)
const SMM_ALLOWED_ACTIONS = ["services", "add", "status", "balance"];

exports.smmApi = onRequest(
  { region: "asia-northeast3", cors: true, secrets: [SMMKINGS_API_KEY] },
  async (req, res) => {
    try {
      // POST(body) 우선, 없으면 GET(query) 도 허용
      const input =
        req.method === "POST" && req.body && Object.keys(req.body).length
          ? req.body
          : req.query || {};

      const action = String(input.action || "");
      if (!SMM_ALLOWED_ACTIONS.includes(action)) {
        return res
          .status(400)
          .json({ error: "허용되지 않은 action 입니다.", allowed: SMM_ALLOWED_ACTIONS });
      }

      // SMM 패널은 application/x-www-form-urlencoded 를 받는다.
      const params = new URLSearchParams();
      params.append("key", SMMKINGS_API_KEY.value());
      params.append("action", action);

      if (action === "add") {
        // 주문 생성: service(서비스ID), link(대상 링크), quantity(수량) 필수
        if (!input.service || !input.link) {
          return res.status(400).json({ error: "service, link 는 필수입니다." });
        }
        params.append("service", String(input.service));
        params.append("link", String(input.link));
        if (input.quantity != null) params.append("quantity", String(input.quantity));
        // 일부 서비스용 선택 파라미터 (있을 때만 전달)
        for (const opt of ["comments", "runs", "interval", "username", "min", "max", "posts", "delay"]) {
          if (input[opt] != null && input[opt] !== "") params.append(opt, String(input[opt]));
        }
      } else if (action === "status") {
        // 단건(order) 또는 다건(orders, 콤마구분) 상태 조회
        if (input.order != null && input.order !== "") {
          params.append("order", String(input.order));
        } else if (input.orders != null && input.orders !== "") {
          params.append("orders", String(input.orders));
        } else {
          return res.status(400).json({ error: "order 또는 orders 가 필요합니다." });
        }
      }
      // services, balance 는 추가 파라미터 없음

      const r = await axios.post(SMM_API_URL, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 20000,
      });

      res.json(r.data);
    } catch (e) {
      const detail = e.response ? e.response.data : e.message;
      console.error("smmApi error:", detail);
      res.status(502).json({ error: "SMM API 호출 실패", detail });
    }
  }
);
