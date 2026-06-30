const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
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

// ===========================================================================
// SMM 리셀 패널 (고객용)
// ===========================================================================
// SMMKings 를 "공급처"로 두고, 마진을 붙여 고객에게 재판매한다.
// 핵심 원칙: 가격 계산 / 잔액 차감 / 공급처 주문은 전부 서버에서만 한다.
//   - API 키는 Firebase Secret 으로만 보관 (프론트 노출 금지)
//   - 고객은 onCall 함수만 호출 (Firebase 로그인 필수)
//   - 잔액·주문 기록은 Admin SDK 로만 기록 (고객이 직접 못 바꿈)
//
// 설정:
//   firebase functions:secrets:set SMMKINGS_API_KEY
//
// Firestore 구조:
//   users/{uid}      { email, balance(USD), role:"user"|"admin", createdAt }
//   orders/{id}      { uid, providerOrder, service, serviceName, link,
//                      quantity, charge, status, createdAt }
//   config/settings  { markupPercent }   // 마진 % (기본 20)
// ---------------------------------------------------------------------------
const SMMKINGS_API_KEY = defineSecret("SMMKINGS_API_KEY");
const SMM_API_URL = "https://smmkings.com/api/v2";
const SMM_REGION = "asia-northeast3";

// SMMKings(공급처)로 요청 — 서버 전용. key 는 Secret 에서만 붙는다.
async function smmRequest(action, extra = {}) {
  const params = new URLSearchParams();
  params.append("key", SMMKINGS_API_KEY.value());
  params.append("action", action);
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && v !== "") params.append(k, String(v));
  }
  const r = await axios.post(SMM_API_URL, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 20000,
  });
  return r.data;
}

async function getMarkupPercent() {
  const snap = await db.collection("config").doc("settings").get();
  const v = snap.exists ? snap.data().markupPercent : undefined;
  return typeof v === "number" ? v : 20; // 기본 마진 20%
}

async function getUserDoc(uid) {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  return { ref, data: snap.exists ? snap.data() : null };
}

function requireAuth(req) {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  return req.auth.uid;
}

async function requireAdmin(req) {
  const uid = requireAuth(req);
  const { data } = await getUserDoc(uid);
  if (!data || data.role !== "admin") {
    throw new HttpsError("permission-denied", "관리자만 가능합니다.");
  }
  return uid;
}

// 회원가입 직후 호출 — users 문서 생성 (없으면)
exports.smmEnsureUser = onCall({ region: SMM_REGION }, async (req) => {
  const uid = requireAuth(req);
  const { ref, data } = await getUserDoc(uid);
  if (!data) {
    await ref.set({
      email: req.auth.token.email || "",
      balance: 0,
      role: "user",
      createdAt: Date.now(),
    });
  }
  const fresh = (await ref.get()).data();
  return { uid, email: fresh.email, balance: fresh.balance, role: fresh.role };
});

// 내 정보(잔액/권한) 조회
exports.smmMe = onCall({ region: SMM_REGION }, async (req) => {
  const uid = requireAuth(req);
  const { data } = await getUserDoc(uid);
  if (!data) throw new HttpsError("not-found", "사용자 정보가 없습니다. 다시 로그인해 주세요.");
  return { uid, email: data.email, balance: data.balance || 0, role: data.role || "user" };
});

// 서비스 목록 (마진 적용, 공급처 원가는 숨김)
exports.smmServices = onCall(
  { region: SMM_REGION, secrets: [SMMKINGS_API_KEY] },
  async (req) => {
    requireAuth(req);
    const markup = await getMarkupPercent();
    const mult = 1 + markup / 100;
    const list = await smmRequest("services");
    if (!Array.isArray(list)) {
      throw new HttpsError("internal", "서비스 목록을 불러오지 못했습니다.");
    }
    return list.map((s) => ({
      service: s.service,
      name: s.name,
      category: s.category,
      type: s.type,
      min: s.min,
      max: s.max,
      // 고객가 (1000개 기준), 원가는 응답에 포함하지 않음
      rate: +(parseFloat(s.rate) * mult).toFixed(4),
    }));
  }
);

// 주문 생성 — 잔액 차감(트랜잭션) → 공급처 주문 → 실패 시 환불
exports.smmPlaceOrder = onCall(
  { region: SMM_REGION, secrets: [SMMKINGS_API_KEY] },
  async (req) => {
    const uid = requireAuth(req);
    const { service, link, quantity } = req.data || {};
    if (!service || !link || quantity == null) {
      throw new HttpsError("invalid-argument", "service, link, quantity 는 필수입니다.");
    }
    const qty = parseInt(quantity, 10);
    if (!(qty > 0)) throw new HttpsError("invalid-argument", "수량이 올바르지 않습니다.");

    // 공급처 서비스 정보로 가격 계산
    const list = await smmRequest("services");
    const svc = Array.isArray(list)
      ? list.find((s) => String(s.service) === String(service))
      : null;
    if (!svc) throw new HttpsError("not-found", "서비스를 찾을 수 없습니다.");
    if (qty < parseInt(svc.min, 10) || qty > parseInt(svc.max, 10)) {
      throw new HttpsError("invalid-argument", `수량은 ${svc.min} ~ ${svc.max} 사이여야 합니다.`);
    }

    const markup = await getMarkupPercent();
    const mult = 1 + markup / 100;
    const charge = +(((parseFloat(svc.rate) * mult) * qty) / 1000).toFixed(4);

    // 1) 잔액 차감 (원자적)
    const userRef = db.collection("users").doc(uid);
    await db.runTransaction(async (tx) => {
      const u = await tx.get(userRef);
      const bal = u.exists ? u.data().balance || 0 : 0;
      if (bal < charge) {
        throw new HttpsError("failed-precondition", "잔액이 부족합니다. 충전 후 이용해 주세요.");
      }
      tx.update(userRef, { balance: +(bal - charge).toFixed(4) });
    });

    // 2) 공급처(SMMKings) 실제 주문
    let smmRes;
    try {
      smmRes = await smmRequest("add", { service, link, quantity: qty });
    } catch (e) {
      await userRef.update({ balance: admin.firestore.FieldValue.increment(charge) });
      throw new HttpsError("internal", "주문 전송 실패. 잔액이 환불되었습니다.");
    }
    if (!smmRes || smmRes.error || !smmRes.order) {
      await userRef.update({ balance: admin.firestore.FieldValue.increment(charge) });
      const msg = smmRes && smmRes.error ? smmRes.error : "공급처 주문 거부";
      throw new HttpsError("internal", `주문 실패: ${msg} (환불됨)`);
    }

    // 3) 주문 기록
    const order = {
      uid,
      providerOrder: smmRes.order,
      service: String(service),
      serviceName: svc.name,
      link,
      quantity: qty,
      charge,
      status: "Pending",
      createdAt: Date.now(),
    };
    const ref = await db.collection("orders").add(order);
    const balSnap = await userRef.get();
    return { id: ref.id, ...order, balance: balSnap.data().balance };
  }
);

// 내 주문 목록
exports.smmMyOrders = onCall({ region: SMM_REGION }, async (req) => {
  const uid = requireAuth(req);
  const snap = await db
    .collection("orders")
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
});

// 주문 상태 새로고침 (공급처 상태 동기화)
exports.smmRefreshStatus = onCall(
  { region: SMM_REGION, secrets: [SMMKINGS_API_KEY] },
  async (req) => {
    const uid = requireAuth(req);
    const { id } = req.data || {};
    if (!id) throw new HttpsError("invalid-argument", "주문 id 가 필요합니다.");
    const ref = db.collection("orders").doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().uid !== uid) {
      throw new HttpsError("not-found", "주문을 찾을 수 없습니다.");
    }
    const st = await smmRequest("status", { order: snap.data().providerOrder });
    const update = {
      status: st.status || snap.data().status,
      remains: st.remains != null ? st.remains : null,
      startCount: st.start_count != null ? st.start_count : null,
    };
    await ref.update(update);
    return { id, ...update };
  }
);

// ---- 관리자 전용 ---------------------------------------------------------

// 마진(%) 설정
exports.smmSetMarkup = onCall({ region: SMM_REGION }, async (req) => {
  await requireAdmin(req);
  const pct = parseFloat(req.data && req.data.markupPercent);
  if (!(pct >= 0)) throw new HttpsError("invalid-argument", "올바른 마진(%)을 입력하세요.");
  await db.collection("config").doc("settings").set({ markupPercent: pct }, { merge: true });
  return { markupPercent: pct };
});

// 고객 잔액 충전/조정 (수동 입금 확인 후 사용)
exports.smmAdjustBalance = onCall({ region: SMM_REGION }, async (req) => {
  await requireAdmin(req);
  const { email, amount } = req.data || {};
  const amt = parseFloat(amount);
  if (!email || isNaN(amt)) throw new HttpsError("invalid-argument", "email, amount 가 필요합니다.");
  const q = await db.collection("users").where("email", "==", email).limit(1).get();
  if (q.empty) throw new HttpsError("not-found", "해당 이메일의 사용자가 없습니다.");
  const ref = q.docs[0].ref;
  await ref.update({ balance: admin.firestore.FieldValue.increment(amt) });
  const after = (await ref.get()).data().balance;
  return { email, added: amt, balance: after };
});

// 공급처(SMMKings) 잔액 — 관리자만
exports.smmProviderBalance = onCall(
  { region: SMM_REGION, secrets: [SMMKINGS_API_KEY] },
  async (req) => {
    await requireAdmin(req);
    return await smmRequest("balance");
  }
);

// 전체 주문 목록 — 관리자만
exports.smmAllOrders = onCall({ region: SMM_REGION }, async (req) => {
  await requireAdmin(req);
  const snap = await db.collection("orders").orderBy("createdAt", "desc").limit(200).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
});
