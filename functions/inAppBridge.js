// functions/inAppBridge.js
// 카카오톡/인앱 웹뷰 감지 + 외부 기본 브라우저(크롬/사파리)로 탈출시키는 브리지.
// googleAuth.js 의 googleAuthStart 에서 res.redirect(url) 대신 이걸 호출한다.

// 인앱 브라우저 UA 감지 (카카오톡이 주 타깃, 그 외 흔한 인앱도 함께 커버)
function isInAppBrowser(ua) {
  ua = (ua || "").toLowerCase();
  return /kakaotalk|instagram|fbav|fban|fb_iab|line\/|naver|daumapps|band|everytimeapp|zumapp/.test(ua);
}

function isKakaoTalk(ua) {
  return /kakaotalk/i.test(ua || "");
}

// 인앱이면 브리지 HTML 반환(true), 아니면 그냥 리다이렉트(false).
// 반환값으로 호출부에서 분기하기 편하게 만들어 둠.
function redirectOrBridge(req, res, targetUrl) {
  const ua = req.get("user-agent") || req.headers["user-agent"] || "";
  if (!isInAppBrowser(ua)) {
    res.redirect(targetUrl);
    return false;
  }
  res.set("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(buildBridgeHtml(targetUrl));
  return true;
}

function buildBridgeHtml(targetUrl) {
  // 클라이언트 스크립트 안에서 다시 UA를 보고 카톡/안드로이드/그 외로 분기한다.
  const safe = JSON.stringify(targetUrl); // XSS 방지: JS 문자열 리터럴로 안전 삽입
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>외부 브라우저로 이동</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
       margin:0;padding:48px 24px;text-align:center;color:#222;background:#fafafa;line-height:1.6}
  .card{max-width:360px;margin:0 auto;background:#fff;border-radius:16px;padding:32px 24px;
        box-shadow:0 4px 24px rgba(0,0,0,.06)}
  h1{font-size:18px;margin:0 0 8px}
  p{font-size:14px;color:#555;margin:6px 0}
  a.btn{display:inline-block;margin-top:20px;padding:14px 22px;background:#3b82f6;color:#fff;
        border-radius:10px;text-decoration:none;font-size:15px;font-weight:600}
  .hint{margin-top:18px;font-size:12px;color:#999}
</style>
</head>
<body>
  <div class="card">
    <h1>구글 로그인을 위해 이동합니다</h1>
    <p>카카오톡 안에서는 구글 로그인이 차단돼요.</p>
    <p>기본 브라우저(크롬·사파리)로 열고 있어요…</p>
    <a id="manual" class="btn" href=${safe}>안 열리면 여기를 눌러주세요</a>
    <p class="hint">그래도 안 열리면 오른쪽 위 ⋮ / 공유 → “다른 브라우저로 열기”를 눌러주세요.</p>
  </div>
<script>
(function () {
  var target = ${safe};
  var ua = (navigator.userAgent || "").toLowerCase();
  try {
    if (ua.indexOf("kakaotalk") > -1) {
      // 카카오톡: iOS/Android 공통으로 외부 기본 브라우저에서 열기
      location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(target);
    } else if (ua.indexOf("android") > -1) {
      // 안드로이드 기타 인앱: 크롬으로 강제 오픈 (실패 시 fallback_url)
      var hostAndPath = target.replace(/^https?:\\/\\//, "");
      location.href = "intent://" + hostAndPath +
        "#Intent;scheme=https;package=com.android.chrome;" +
        "S.browser_fallback_url=" + encodeURIComponent(target) + ";end";
    } else {
      // iOS 기타 인앱: 새 창/현재창 이동 시도 (완전 자동 탈출은 불가 → 수동 안내 노출)
      location.href = target;
    }
  } catch (e) {
    location.href = target;
  }
})();
</script>
</body>
</html>`;
}

module.exports = { isInAppBrowser, isKakaoTalk, redirectOrBridge, buildBridgeHtml };
