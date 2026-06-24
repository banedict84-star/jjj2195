const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { google } = require("googleapis");

if (!admin.apps.length) admin.initializeApp();

const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");

// 이 콜백 URL을 OAuth 클라이언트의 '승인된 리디렉션 URI'에 등록해야 함
const REDIRECT_URI =
  "https://asia-northeast3-jjj2195-1bd15.cloudfunctions.net/googleAuthCallback";
const SCOPES = ["https://www.googleapis.com/auth/calendar"];

const opts = {
  region: "asia-northeast3",
  secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET],
};

function oauthClient() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID.value(),
    GOOGLE_CLIENT_SECRET.value(),
    REDIRECT_URI
  );
}

// 사용자가 "내 캘린더 연동하기" 버튼을 누르면 구글 동의화면으로 보냄
exports.googleAuthStart = onRequest(opts, async (req, res) => {
  const uid = String(req.query.uid || "").trim();
  if (!uid) {
    res.status(400).send("uid가 필요합니다.");
    return;
  }
  const url = oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: uid, // 어떤 카카오 사용자인지 표시
  });
  res.redirect(url);
});

// 구글이 인증코드를 돌려주면 토큰으로 교환해 사용자별로 저장
exports.googleAuthCallback = onRequest(opts, async (req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  try {
    const code = String(req.query.code || "");
    const uid = String(req.query.state || "");
    if (!code || !uid) {
      res.status(400).send("<h3>잘못된 요청입니다.</h3>");
      return;
    }
    const { tokens } = await oauthClient().getToken(code);
    if (!tokens.refresh_token) {
      res
        .status(400)
        .send(
          "<h3>토큰 발급 실패</h3><p>이미 연동된 계정일 수 있어요. 구글 계정 보안 설정에서 권한을 해제한 뒤 다시 시도해주세요.</p>"
        );
      return;
    }
    await admin
      .firestore()
      .collection("userTokens")
      .doc(uid)
      .set(
        {
          refreshToken: tokens.refresh_token,
          calendarId: "primary",
          linkedAt: Date.now(),
        },
        { merge: true }
      );
    res.send(
      `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
        `<body style="font-family:sans-serif;text-align:center;padding:60px 20px">` +
        `<div style="font-size:48px">✅</div>` +
        `<h2>캘린더 연동 완료!</h2>` +
        `<p>이제 카카오톡으로 돌아가<br>일정을 보내보세요. 😊</p>` +
        `<p style="color:#888;font-size:13px">예) 내일 오후 3시 회의</p>` +
        `</body></html>`
    );
  } catch (e) {
    console.error("googleAuthCallback error:", e);
    res
      .status(500)
      .send("<h3>연동 중 오류</h3><p>" + (e.message || "알 수 없는 오류") + "</p>");
  }
});
