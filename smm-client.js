// ---------------------------------------------------------------------------
// SMMKings 연동 클라이언트 (프론트엔드용)
// ---------------------------------------------------------------------------
// API 키는 여기에 없다. 모든 호출은 Firebase Function(smmApi) 프록시를 거치고,
// 키는 서버(Secret)에서만 붙는다.  →  HTML 소스에 키가 노출되지 않음.
//
// 사용 예:
//   const bal = await smm.balance();
//   const list = await smm.services();
//   const order = await smm.addOrder({ service: 123, link: "https://...", quantity: 1000 });
//   const st = await smm.status(order.order);
// ---------------------------------------------------------------------------

const SMM_ENDPOINT =
  "https://asia-northeast3-jjj2195-1bd15.cloudfunctions.net/smmApi";

async function smmCall(payload) {
  const res = await fetch(SMM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || `SMM 호출 실패 (${res.status})`);
  }
  return data;
}

const smm = {
  // 잔액 조회 → { balance: "100.0", currency: "USD" }
  balance: () => smmCall({ action: "balance" }),

  // 서비스 목록 → [{ service, name, type, category, rate, min, max, ... }, ...]
  services: () => smmCall({ action: "services" }),

  // 주문 생성 → { order: 23501 }
  // opts: { service, link, quantity, ...(comments/runs/interval 등 선택) }
  addOrder: (opts) => smmCall({ action: "add", ...opts }),

  // 단건 상태 조회 → { charge, start_count, status, remains, currency }
  status: (order) => smmCall({ action: "status", order }),

  // 다건 상태 조회 (콤마 구분 또는 배열)
  statusMany: (orders) =>
    smmCall({
      action: "status",
      orders: Array.isArray(orders) ? orders.join(",") : orders,
    }),
};

// 모듈/전역 양쪽 지원
if (typeof window !== "undefined") window.smm = smm;
if (typeof module !== "undefined") module.exports = smm;
