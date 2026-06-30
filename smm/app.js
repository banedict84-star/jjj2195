// ---------------------------------------------------------------------------
// SMM 리셀 패널 - 프론트엔드 공통 초기화
// ---------------------------------------------------------------------------
// 이 파일에는 API 키가 없다. 모든 민감 작업(가격/잔액/주문)은 Cloud Function
// (onCall, 로그인 강제) 에서만 처리된다.
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyAIjhvbCztHoF7YwP2IYIk2C6jCI64uFhs",
  authDomain: "jjj2195-1bd15.firebaseapp.com",
  projectId: "jjj2195-1bd15",
  storageBucket: "jjj2195-1bd15.firebasestorage.app",
  messagingSenderId: "370852437825",
  appId: "1:370852437825:web:b0a891d6a99b426d230bc0",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
// 함수는 asia-northeast3 리전에 배포됨
const fns = firebase.app().functions("asia-northeast3");

// callable 호출 래퍼 → 결과 data 만 반환, 에러는 한글 메시지로 throw
async function call(name, data) {
  try {
    const res = await fns.httpsCallable(name)(data || {});
    return res.data;
  } catch (e) {
    throw new Error(e.message || "요청 처리 중 오류가 발생했습니다.");
  }
}

// 로그인 보장: 안 되어 있으면 로그인 페이지로 이동
function requireLogin(redirect = "index.html") {
  return new Promise((resolve) => {
    auth.onAuthStateChanged((user) => {
      if (!user) {
        location.href = redirect;
        return;
      }
      resolve(user);
    });
  });
}

async function logout() {
  await auth.signOut();
  location.href = "index.html";
}

// 상태값 → 뱃지 클래스
function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("complete")) return "completed";
  if (s.includes("progress") || s.includes("processing")) return "progress";
  if (s.includes("cancel") || s.includes("partial") || s.includes("refund")) return "canceled";
  return "pending";
}

function fmt(n, d = 4) {
  return Number(n || 0).toFixed(d);
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
