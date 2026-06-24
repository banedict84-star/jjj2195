const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");

admin.initializeApp();
const db = admin.firestore();

// 카카오톡 개인비서 → 구글 캘린더 일정 등록 웹훅
exports.kakaoSkill = require("./kakaoCalendar").kakaoSkill;

// 능동형 알림: 아침 브리핑 + 일정 30분 전 리마인더 (카카오 나에게 보내기)
exports.morningBriefing = require("./kakaoNotify").morningBriefing;
exports.eventReminder = require("./kakaoNotify").eventReminder;

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
