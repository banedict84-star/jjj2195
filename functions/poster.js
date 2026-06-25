const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { Resvg } = require("@resvg/resvg-js");
const sharp = require("sharp");

// 정식 Storage 버킷(없으면 Firestore 폴백). create_bucket 워크플로우로 1회 생성.
const STORAGE_BUCKET_NAME = "jjj2195-1bd15-moida";

if (!admin.apps.length) admin.initializeApp();

// 문구 생성에 쓰는 시크릿 (kakaoCalendar.js와 동일 — MyAPI 호환 프록시 사용)
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const ANTHROPIC_BASE_URL = defineSecret("ANTHROPIC_BASE_URL");
const ANTHROPIC_MODEL = defineSecret("ANTHROPIC_MODEL");
// OpenAI(GPT) — AI 디자인/문구 생성에 우선 사용(있을 때). 모델은 코드 기본값 사용.
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
// 카카오 "나에게 보내기"용 (콜백 미사용 시 결과를 나와의 채팅으로 전송)
const KAKAO_REST_API_KEY = defineSecret("KAKAO_REST_API_KEY");
const KAKAO_REFRESH_TOKEN = defineSecret("KAKAO_REFRESH_TOKEN");
const KAKAO_CLIENT_SECRET = defineSecret("KAKAO_CLIENT_SECRET");

const AUTH_BASE = "https://asia-northeast3-jjj2195-1bd15.cloudfunctions.net";
const BRAND = "경기도의원 장윤정";
const COLOR_PRIMARY = "#004EA2"; // 민주당 블루
const COLOR_ACCENT = "#0094D9";
// 카드뉴스(남색+골드) 디자인용 브랜딩/색
const POSTER_NAME = "장윤정";
const POSTER_ROLE = "경기도의원";
const POSTER_PARTY = "더불어민주당";
const POSTER_REGION = "안산";
const NAVY = "#0B1F44";
const NAVY2 = "#16315F";
const GOLD = "#C9A24B";

function optionalSecret(secret) {
  try {
    const v = secret.value();
    return v && v.length ? v : undefined;
  } catch (_) {
    return undefined;
  }
}

// ── 폰트 로딩 (한 번만) ────────────────────────────────────────────────
let FONT_BUFFERS = null;
function fontBuffers() {
  if (FONT_BUFFERS) return FONT_BUFFERS;
  const dir = path.join(__dirname, "assets");
  const files = ["NanumGothic.ttf", "NanumGothic-Bold.ttf", "NanumGothic-ExtraBold.ttf"];
  FONT_BUFFERS = files
    .map((f) => path.join(dir, f))
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.readFileSync(p));
  return FONT_BUFFERS;
}

// ── 텍스트 유틸 ────────────────────────────────────────────────────────
function escapeXml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 글자 폭 추정 (한글/전각=1.0, 그 외=0.55) → 폰트크기 기준 픽셀폭
function isWide(ch) {
  const c = ch.codePointAt(0);
  return (
    (c >= 0x1100 && c <= 0x11ff) || // 한글 자모
    (c >= 0x3000 && c <= 0x303f) || // CJK 기호
    (c >= 0x3130 && c <= 0x318f) || // 호환 자모
    (c >= 0xac00 && c <= 0xd7a3) || // 한글 음절
    (c >= 0x4e00 && c <= 0x9fff) || // 한자
    (c >= 0xff00 && c <= 0xffef) // 전각
  );
}

function textWidth(str, fontSize) {
  let w = 0;
  for (const ch of String(str)) w += fontSize * (isWide(ch) ? 1.0 : 0.55);
  return w;
}

// maxWidth(px) 안에서 줄바꿈. 명시적 \n 도 존중. 최대 maxLines 줄, 넘으면 …
function wrapLines(text, fontSize, maxWidth, maxLines) {
  const out = [];
  const paragraphs = String(text || "").split(/\r?\n/);
  for (const para of paragraphs) {
    if (para.trim() === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const ch of para) {
      const test = line + ch;
      if (textWidth(test, fontSize) > maxWidth && line) {
        out.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  if (maxLines && out.length > maxLines) {
    const trimmed = out.slice(0, maxLines);
    let last = trimmed[maxLines - 1];
    while (last && textWidth(last + "…", fontSize) > maxWidth) {
      last = last.slice(0, -1);
    }
    trimmed[maxLines - 1] = last + "…";
    return trimmed;
  }
  return out;
}

// ── 행사 요지 → 필드 추출 (라벨 있으면 우선, 없으면 휴리스틱) ──────────────
function parseBriefFields(brief) {
  const text = String(brief || "").trim();
  const fields = { title: "", datetime: "", location: "", body: "" };
  const grab = (re) => {
    const m = text.match(re);
    return m ? m[1].trim() : "";
  };
  fields.title =
    grab(/(?:행사명|제목|행사)\s*[:：]\s*(.+)/) ||
    grab(/^(.+?)\s*(?:개최|행사|간담회|토론회|방문|회의)/m);
  fields.datetime = grab(/(?:일시|날짜|일자|시간)\s*[:：]\s*(.+)/);
  fields.location = grab(/(?:장소|위치|place)\s*[:：]\s*(.+)/i);
  fields.body =
    grab(/(?:내용|요지|주요\s*내용|개요)\s*[:：]\s*([\s\S]+)/) || text;

  if (!fields.title) {
    // 라벨이 전혀 없으면 첫 줄을 제목으로
    const firstLine = text.split(/\r?\n/)[0] || text;
    fields.title = firstLine.slice(0, 40);
  }
  return fields;
}

// ── 1) 홍보 문구 생성 (MyAPI → 실패 시 템플릿 폴백) ──────────────────────
function templateMessage(f) {
  const lines = [];
  lines.push(`📢 [${BRAND}] ${f.title || "행사 안내"}`);
  lines.push("");
  if (f.datetime) lines.push(`🗓️ 일시 : ${f.datetime}`);
  if (f.location) lines.push(`📍 장소 : ${f.location}`);
  if (f.datetime || f.location) lines.push("");
  const body = (f.body || "").replace(/\s+/g, " ").trim();
  if (body) lines.push(body.length > 220 ? body.slice(0, 220) + "…" : body);
  lines.push("");
  lines.push("많은 관심과 참여 부탁드립니다. 🙏");
  return lines.join("\n");
}

// OpenAI(GPT) Chat Completions 호출 (axios)
async function openaiChat(system, user, opts) {
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: opts.model || "gpt-4o-mini",
      temperature: opts.temperature == null ? 0.7 : opts.temperature,
      max_tokens: opts.maxTokens || 1500,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: opts.timeout || 60000,
    }
  );
  const c = res.data && res.data.choices && res.data.choices[0];
  return (c && c.message && c.message.content) || "";
}

const MSG_SYSTEM =
  `너는 국회의원실 공보 담당자다. 아래 '행사 정보 원문'을 읽고 카카오톡에 그대로 전달할 ` +
  `한국어 홍보 안내문을 작성한다.\n` +
  `[작성 규칙]\n` +
  `- 인사말·메타설명·되묻기·다른 형식 제안을 절대 넣지 말 것. 오직 안내문 본문만. 마크다운(**, #) 금지.\n` +
  `- 원문에서 행사명·일시·장소·핵심내용을 스스로 파악해 정리. 모르는 항목은 아예 적지 마라(빈 '일시:'·'장소:' 금지).\n` +
  `- '오늘/내일' 같은 표현은 [기준 날짜] 기준으로 실제 날짜로 변환.\n` +
  `- 핵심 내용을 2~3문장으로. 마지막에 참여/관심 독려 한 줄. 적절한 이모지(과하지 않게).\n` +
  `- 의원실 명칭: ${BRAND}\n` +
  `[출력 형식] 반드시 <<<MSG>>> 와 <<<END>>> 사이에 안내문만 출력하라. 그 밖의 텍스트는 한 글자도 쓰지 마라.`;

function msgUser(f, opts) {
  const today = (opts && opts.today) || "";
  const known = [];
  if (f.title) known.push(`행사명 후보: ${f.title}`);
  if (f.datetime) known.push(`일시: ${f.datetime}`);
  if (f.location) known.push(`장소: ${f.location}`);
  return (
    (today ? `[기준 날짜] ${today}\n` : "") +
    `[행사 정보 원문]\n${(opts && opts.rawBrief) || f.body || ""}\n` +
    (known.length ? `\n[참고 추출값]\n${known.join("\n")}` : "")
  );
}

async function generateMessage(f, opts) {
  // 1) OpenAI(GPT) 우선
  if (opts && opts.openaiKey) {
    try {
      const raw = await openaiChat(MSG_SYSTEM, msgUser(f, opts), {
        apiKey: opts.openaiKey,
        model: opts.openaiModel || "gpt-4o-mini",
        temperature: 0.4,
        maxTokens: 700,
        timeout: 20000,
      });
      const cleaned = extractMessage(raw);
      if (cleaned) return cleaned;
      console.warn("OpenAI 문구 형식 미준수 → 다음 단계");
    } catch (e) {
      console.warn("OpenAI 문구 생성 실패:", e.message);
    }
  }
  // 2) MyAPI(Anthropic 호환) 폴백
  if (opts && opts.apiKey) {
    try {
      const clientOpts = { apiKey: opts.apiKey, timeout: 14000, maxRetries: 0 };
      if (opts.baseURL) clientOpts.baseURL = opts.baseURL;
      const client = new Anthropic(clientOpts);
      const resp = await client.messages.create({
        model: opts.model || "claude-haiku-4-5",
        max_tokens: 700,
        temperature: 0.4,
        system: MSG_SYSTEM,
        messages: [{ role: "user", content: msgUser(f, opts) }],
      });
      const block = (resp.content || []).find((b) => b.type === "text");
      const cleaned = extractMessage(block && block.text ? block.text : "");
      if (cleaned) return cleaned;
    } catch (e) {
      console.warn("generateMessage MyAPI 실패 → 템플릿 폴백:", e.message);
    }
  }
  // 3) 템플릿
  return templateMessage(f);
}

// MyAPI 출력에서 안내문 본문만 안전하게 추출. 잡설 섞이면 null(→템플릿).
function extractMessage(raw) {
  if (!raw) return null;
  let t = raw.trim();
  // 1) 구분자 사이 우선
  const m = t.match(/<<<MSG>>>([\s\S]*?)<<<END>>>/);
  if (m) t = m[1].trim();
  else {
    // 2) 구분자 누락 시 메타 잡설 신호가 있으면 신뢰 불가
    if (
      /(답변드릴게요|따르지 않고|필요하신가요|보도자료 형식|초청장|식순|어떤 쪽이|알려주시면)/.test(
        t
      )
    ) {
      return null;
    }
  }
  // 잔여 구분자/코드펜스/마크다운 제거
  t = t
    .replace(/<<<MSG>>>|<<<END>>>/g, "")
    .replace(/^```[\s\S]*?\n|```$/g, "")
    .replace(/\*\*/g, "") // 볼드 마크다운
    .replace(/^#{1,6}\s*/gm, "") // 헤딩 마크다운
    .replace(/[ \t]+$/gm, "")
    .trim();
  // 너무 짧거나 비면 폴백
  return t.length >= 10 ? t : null;
}

// ── 2) 사진 다운로드 → data URI ────────────────────────────────────────
async function fetchImageDataUri(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      maxContentLength: 20 * 1024 * 1024,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    let buf = Buffer.from(res.data);
    let mime = res.headers["content-type"] || "";
    // 사진을 자보 사진틀 비율로 리사이즈 + JPEG 압축 (용량 대폭 축소)
    try {
      buf = await sharp(buf)
        .rotate() // EXIF 회전 보정
        .resize({ width: 1200, height: 820, fit: "cover", position: "centre" })
        .jpeg({ quality: 82 })
        .toBuffer();
      mime = "image/jpeg";
    } catch (e) {
      console.warn("사진 압축 실패, 원본 임베드:", e.message);
      if (!/^image\//.test(mime)) mime = "image/jpeg";
    }
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch (e) {
    console.warn("fetchImageDataUri 실패:", e.message);
    return null;
  }
}

// ── 3) SVG 자보 → PNG ──────────────────────────────────────────────────
// 남색+골드 카드뉴스 템플릿 (장윤정 경기도의원 스타일)
function buildSvg(f, photoDataUri) {
  const W = 1080;
  const H = 1350;
  const pad = 70;
  const innerW = W - pad * 2;

  // 제목 (ExtraBold, 최대 2줄)
  const tSize = 74;
  const titleLines = wrapLines(f.title || "행사 안내", tSize, innerW, 2);
  const ty = 180;
  const titleEls = titleLines
    .map(
      (ln, i) =>
        `<text x="${pad}" y="${ty + i * 90}" font-family="NanumGothic ExtraBold" font-size="${tSize}" fill="#FFFFFF">${escapeXml(ln)}</text>`
    )
    .join("");
  const hb = ty + (titleLines.length - 1) * 90;

  // 사진 프레임 (골드 테두리)
  const px = pad;
  const pw = innerW;
  const ph = 470;
  const py = hb + 60;
  const photoEl = photoDataUri
    ? `<image x="${px}" y="${py}" width="${pw}" height="${ph}" href="${photoDataUri}" preserveAspectRatio="xMidYMid slice" clip-path="url(#pc)"/>`
    : `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="24" fill="#22365C"/>` +
      `<text x="${W / 2}" y="${py + ph / 2}" text-anchor="middle" font-family="NanumGothic" font-size="30" fill="#7E92B5">행사 사진</text>`;

  // 정보 패널 (일시/장소 + 본문)
  const ipy = py + ph + 46;
  let iy = ipy + 74;
  const infoEls = [];
  function row(label, value) {
    if (!value) return;
    infoEls.push(
      `<rect x="${pad}" y="${iy - 30}" width="10" height="40" rx="3" fill="${GOLD}"/>` +
        `<text x="${pad + 30}" y="${iy}" font-family="NanumGothic Bold" font-size="34" fill="${GOLD}">${escapeXml(label)}</text>` +
        `<text x="${pad + 170}" y="${iy}" font-family="NanumGothic" font-size="34" fill="#FFFFFF">${escapeXml(value)}</text>`
    );
    iy += 64;
  }
  row("일시", f.datetime);
  row("장소", f.location);
  const bodyLines = wrapLines(f.body || "", 30, innerW, 3);
  const bodyEls = bodyLines
    .map(
      (ln, i) =>
        `<text x="${pad}" y="${iy + 22 + i * 44}" font-family="NanumGothic" font-size="30" fill="#D8E0EE">${escapeXml(ln)}</text>`
    )
    .join("");
  const panelH = iy + 22 + bodyLines.length * 44 + 18 - ipy;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="#0E2750"/></linearGradient>
    <clipPath id="pc"><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="24"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <path d="M0,360 L1080,150 L1080,360 L0,540 Z" fill="${NAVY2}" opacity="0.5"/>
  <path d="M0,372 L1080,162" stroke="${GOLD}" stroke-width="3" opacity="0.8"/>
  <rect x="${pad}" y="50" width="220" height="56" rx="28" fill="${GOLD}"/>
  <text x="${pad + 110}" y="88" text-anchor="middle" font-family="NanumGothic ExtraBold" font-size="30" fill="${NAVY}">${escapeXml(POSTER_PARTY)}</text>
  <text x="${W - pad}" y="90" text-anchor="end" font-family="NanumGothic Bold" font-size="32" fill="${GOLD}">${escapeXml(POSTER_REGION)}</text>
  ${titleEls}
  <rect x="${pad + 2}" y="${hb + 24}" width="120" height="8" rx="4" fill="${GOLD}"/>
  <rect x="${px - 5}" y="${py - 5}" width="${pw + 10}" height="${ph + 10}" rx="28" fill="none" stroke="${GOLD}" stroke-width="5"/>
  ${photoEl}
  <rect x="${pad - 12}" y="${ipy}" width="${innerW + 24}" height="${panelH}" rx="22" fill="${NAVY2}" opacity="0.55"/>
  ${infoEls.join("")}
  ${bodyEls}
  <rect x="0" y="${H - 120}" width="${W}" height="120" fill="#08182F"/>
  <rect x="0" y="${H - 120}" width="${W}" height="5" fill="${GOLD}"/>
  <circle cx="${pad + 30}" cy="${H - 60}" r="32" fill="none" stroke="${GOLD}" stroke-width="3"/>
  <text x="${pad + 30}" y="${H - 50}" text-anchor="middle" font-family="NanumGothic Bold" font-size="26" fill="${GOLD}">의회</text>
  <text x="${pad + 90}" y="${H - 68}" font-family="NanumGothic" font-size="26" fill="#AEBBD0">${escapeXml(POSTER_ROLE)}</text>
  <text x="${pad + 90}" y="${H - 30}" font-family="NanumGothic ExtraBold" font-size="44" fill="#FFFFFF">${escapeXml(POSTER_NAME)}</text>
  <text x="${W - pad}" y="${H - 50}" text-anchor="end" font-family="NanumGothic Bold" font-size="28" fill="${GOLD}">${escapeXml(POSTER_PARTY)} · ${escapeXml(POSTER_REGION)}</text>
</svg>`;
}

function renderPng(svg) {
  const r = new Resvg(svg, {
    font: { fontBuffers: fontBuffers(), defaultFontFamily: "NanumGothic" },
    background: "#FFFFFF",
  });
  return r.render().asPng();
}

// SVG → JPEG(가벼움). 변환 실패 시 PNG로.
async function renderImage(svg) {
  const png = renderPng(svg);
  try {
    const jpg = await sharp(png).jpeg({ quality: 86 }).toBuffer();
    return { buffer: jpg, contentType: "image/jpeg", ext: "jpg" };
  } catch (e) {
    console.warn("자보 JPEG 변환 실패, PNG 사용:", e.message);
    return { buffer: png, contentType: "image/png", ext: "png" };
  }
}

// ── 4) PNG 호스팅 (Storage 우선 → 실패 시 Firestore + posterImage 서빙) ──
function projectId() {
  return (
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    "jjj2195-1bd15"
  );
}

async function hostViaStorage(buffer, id, ext, contentType) {
  const candidates = [
    STORAGE_BUCKET_NAME,
    undefined, // 기본 버킷(STORAGE_BUCKET 환경변수)
    `${projectId()}.firebasestorage.app`,
    `${projectId()}.appspot.com`,
  ];
  let lastErr;
  for (const name of candidates) {
    try {
      const bucket = name ? admin.storage().bucket(name) : admin.storage().bucket();
      const file = bucket.file(`posters/${id}.${ext}`);
      await file.save(buffer, {
        metadata: {
          contentType,
          cacheControl: "public, max-age=31536000",
          // 링크를 직접 열면 인라인 표시 대신 파일로 저장(다운로드)되게
          contentDisposition: `attachment; filename="moida_poster.${ext}"`,
        },
        resumable: false,
        validation: false,
      });
      // 균일 액세스 버킷이면 makePublic이 막힘 → 버킷 IAM(allUsers)로 공개. 실패 무시.
      try {
        await file.makePublic();
      } catch (_) {}
      return `https://storage.googleapis.com/${bucket.name}/posters/${id}.${ext}`;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("storage host failed");
}

async function hostImage(buffer, ext, contentType) {
  const id = crypto.randomUUID();
  try {
    return await hostViaStorage(buffer, id, ext, contentType);
  } catch (e) {
    console.warn("Storage 호스팅 실패 → Firestore 폴백:", e.message);
    if (buffer.length > 950 * 1024) throw e; // Firestore 1MB 한계
    await admin
      .firestore()
      .collection("posterImages")
      .doc(id)
      .set({ b64: buffer.toString("base64"), contentType, createdAt: Date.now() });
    return `${AUTH_BASE}/posterImage?id=${id}`;
  }
}

// ── AI가 디자인을 직접 설계 (SVG 생성) ─────────────────────────────────
// AI에게 행사 정보를 주고 자보 SVG를 스스로 디자인하게 한다.
// 한글은 우리가 준 텍스트를 그대로 쓰게 하고, 사진은 __PHOTO__ 자리표시자로 둔다.
// 실패/형식오류 시 null → 호출부에서 템플릿으로 폴백.
const DESIGN_SYSTEM =
  `너는 대한민국 최고의 공보물 그래픽 디자이너다. 국회의원실 행사 홍보용 '웹자보' 한 장을 SVG로 직접 디자인한다.\n` +
  `[캔버스] width=1080 height=1350 세로형. 반드시 viewBox="0 0 1080 1350".\n` +
  `[출력] 오직 유효한 SVG 코드만. 설명·마크다운·코드펜스 금지. <svg 로 시작해 </svg>로 끝낼 것.\n` +
  `[폰트] 반드시 다음만 사용: font-family="NanumGothic"(본문), "NanumGothic Bold", "NanumGothic ExtraBold"(제목). 다른 폰트 금지.\n` +
  `[정보 해석] 아래 '행사 정보 원문'을 읽고 행사명·일시·장소·핵심내용을 너가 스스로 파악해서 배치하라.\n` +
  ` - '오늘/내일/모레/이번 주' 같은 표현은 [기준 날짜]를 기준으로 실제 날짜(예: 2026년 6월 25일(목))로 바꿔서 적어라.\n` +
  ` - '오후 4시', '4시' 같은 시간도 자연스럽게 정리.\n` +
  ` - 행사명은 한 줄로 또렷하게 만들어라(원문이 어수선하면 핵심만 뽑아 자연스러운 제목으로).\n` +
  `[빈 항목 절대 금지] 값을 알 수 없는 항목은 라벨 자체를 그리지 마라. 예: 장소를 모르면 '장소:'라는 글자도 넣지 마라. 빈 칸·빈 라벨·빈 박스는 절대 금지.\n` +
  `[사진] 행사 사진 자리에 <image href="__PHOTO__" ... preserveAspectRatio="xMidYMid slice"/> 를 정확히 1개, 크고 시원하게 배치(clipPath로 둥근 모서리). href는 반드시 __PHOTO__ 그대로.\n` +
  `[디자인 품질] 평범한 '윗줄 제목 + 가운데 사진 + 아래 박스' 레이아웃은 금지(너무 밋밋함). 아래 스타일 중 하나를 골라 과감하게 디자인하라:\n` +
  ` (a) 사진을 상단 풀블리드로 크게 깔고 하단에 짙은 그라데이션 오버레이 위로 제목을 얹는 매거진 커버형\n` +
  ` (b) 화면을 대각선/사선 색면으로 분할하고 제목을 비대칭으로 시원하게 배치한 모던형\n` +
  ` (c) 큰 컬러 사이드바 + 큼직한 제목 + 사진을 카드처럼 띄운 깔끔한 리포트형\n` +
  ` 공통: 색 대비·여백·정렬·시각적 계층을 살리고, 메인색 #004EA2 + 어울리는 보조색/그라데이션/포인트 도형(원·라인·태그) 적극 활용. 제목은 폰트 64~96으로 시원하게. 정보는 아이콘 대신 컬러 점/라인으로 구분.\n` +
  `[금지] 외부 리소스·스크립트·foreignObject·이모지 글자. 이미지는 __PHOTO__ 하나만. 텍스트가 화면 밖으로 넘치면 안 됨(길면 줄바꿈).`;

function designUser(fields, opts) {
  const today = (opts && opts.today) || "";
  const known = [];
  if (fields.title) known.push(`행사명 후보: ${fields.title}`);
  if (fields.datetime) known.push(`일시: ${fields.datetime}`);
  if (fields.location) known.push(`장소: ${fields.location}`);
  return (
    `[의원실] ${BRAND}\n` +
    (today ? `[기준 날짜] ${today}\n` : "") +
    `[행사 정보 원문]\n${(opts && opts.rawBrief) || fields.body || ""}\n\n` +
    (known.length ? `[참고로 추출된 값]\n${known.join("\n")}\n\n` : "") +
    `위 원문을 해석해 웹자보 SVG를 디자인해줘. 모르는 항목은 라벨도 넣지 말고, 사진은 __PHOTO__ 자리표시자로.`
  );
}

function extractSvg(raw) {
  const m = String(raw || "").match(/<svg[\s\S]*<\/svg>/i);
  if (!m) {
    console.warn("AI 디자인: SVG 형식 아님 → 폴백");
    return null;
  }
  const svg = m[0];
  // __PHOTO__ 자리와 텍스트가 있어야 신뢰
  if (!svg.includes("__PHOTO__") || !/<text/i.test(svg)) {
    console.warn("AI 디자인: 필수요소(__PHOTO__/text) 누락 → 폴백");
    return null;
  }
  return svg;
}

async function generateSvgDesign(fields, opts) {
  // 1) OpenAI(GPT) 우선
  if (opts && opts.openaiKey) {
    try {
      const raw = await openaiChat(DESIGN_SYSTEM, designUser(fields, opts), {
        apiKey: opts.openaiKey,
        model: opts.openaiModel || "gpt-4o",
        temperature: 0.85,
        maxTokens: 4000,
        timeout: 70000,
      });
      const svg = extractSvg(raw);
      if (svg) return svg;
    } catch (e) {
      console.warn("OpenAI 디자인 생성 실패:", e.response ? JSON.stringify(e.response.data).slice(0, 300) : e.message);
    }
  }
  // 2) MyAPI(Anthropic 호환) 폴백
  if (opts && opts.apiKey) {
    try {
      const clientOpts = { apiKey: opts.apiKey, timeout: 45000, maxRetries: 0 };
      if (opts.baseURL) clientOpts.baseURL = opts.baseURL;
      const client = new Anthropic(clientOpts);
      const resp = await client.messages.create({
        model: opts.model || "claude-haiku-4-5",
        max_tokens: 4000,
        temperature: 0.8,
        system: DESIGN_SYSTEM,
        messages: [{ role: "user", content: designUser(fields, opts) }],
      });
      const block = (resp.content || []).find((b) => b.type === "text");
      const svg = extractSvg(block && block.text ? block.text : "");
      if (svg) return svg;
    } catch (e) {
      console.warn("MyAPI 디자인 생성 실패 → 템플릿 폴백:", e.message);
    }
  }
  return null;
}

// AI가 원문을 구조화된 필드(JSON)로 정리. 창작 금지·날짜 변환·빈값 허용.
async function aiExtractFields(brief, opts) {
  if (!opts || !opts.openaiKey) return null;
  const today = (opts && opts.today) || "";
  const sys =
    `너는 행사 안내문에서 정보를 정확히 추출하는 도우미다. 아래 '원문'에서 다음을 JSON으로만 출력하라(다른 텍스트·마크다운 금지):\n` +
    `{"title":"행사명","datetime":"일시","location":"장소","body":"핵심 내용 1~2문장"}\n` +
    `[규칙]\n` +
    `- 원문에 없는 내용을 절대 지어내지 마라(슬로건·표어·장소 창작 금지). 모르는 값은 빈 문자열 "".\n` +
    (today
      ? `- '오늘/내일/모레/이번 주' 같은 표현은 기준날짜(${today})로 실제 날짜(예: 2026년 6월 25일(목) 오후 4시)로 변환.\n`
      : "") +
    `- title은 원문 기반으로 자연스럽게(예: "업사이클링 행사 참석함" → "업사이클링 행사").\n` +
    `- body는 원문 내용을 사실대로 정리만. 과장·창작 금지.`;
  try {
    const raw = await openaiChat(sys, `원문: ${brief}`, {
      apiKey: opts.openaiKey,
      model: opts.openaiModel || "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 500,
      timeout: 18000,
    });
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]);
    return {
      title: String(o.title || "").trim(),
      datetime: String(o.datetime || "").trim(),
      location: String(o.location || "").trim(),
      body: String(o.body || "").trim(),
    };
  } catch (e) {
    console.warn("aiExtractFields 실패:", e.message);
    return null;
  }
}

// 자보 1건 생성: 문구 + 이미지 URL 반환
// 기본: AI가 내용만 정리 → 검증된 템플릿으로 렌더(일관된 품질).
// secrets.freeDesign === true 일 때만 GPT가 디자인까지 직접(실험적).
async function buildPoster(input, secrets) {
  let fields = parseBriefFields(input.brief);

  let today = "";
  try {
    today = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(new Date());
  } catch (_) {}
  const aiOpts = { ...(secrets || {}), rawBrief: input.brief, today };

  const photoUri = await fetchImageDataUri(input.imageUrl);
  const [message, aiFields] = await Promise.all([
    generateMessage(fields, aiOpts),
    aiExtractFields(input.brief, aiOpts),
  ]);

  // AI 추출 필드 우선 적용(빈 값은 무시)
  if (aiFields) {
    fields = {
      title: aiFields.title || fields.title,
      datetime: aiFields.datetime || fields.datetime,
      location: aiFields.location || fields.location,
      body: aiFields.body || fields.body,
    };
  }
  // 명시 필드가 들어오면 최우선
  if (input.title) fields.title = input.title;
  if (input.datetime) fields.datetime = input.datetime;
  if (input.location) fields.location = input.location;

  let svg;
  let designedBy = "template";

  // (실험적) GPT가 디자인까지 직접 — freeDesign 켰을 때만
  if (secrets && secrets.freeDesign) {
    const aiSvg = await generateSvgDesign(fields, aiOpts);
    if (aiSvg) {
      const placeholder =
        "data:image/svg+xml;base64," +
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#E9EEF5"/></svg>'
        ).toString("base64");
      svg = aiSvg.split("__PHOTO__").join(photoUri || placeholder);
      designedBy = "ai-free";
    }
  }
  if (!svg) {
    svg = buildSvg(fields, photoUri);
    designedBy = "template";
  }

  let buffer, contentType, ext;
  try {
    ({ buffer, contentType, ext } = await renderImage(svg));
  } catch (e) {
    console.warn("렌더 실패, 템플릿으로 재시도:", e.message);
    svg = buildSvg(fields, photoUri);
    designedBy = "template";
    ({ buffer, contentType, ext } = await renderImage(svg));
  }
  const imageUrl = await hostImage(buffer, ext, contentType);
  return { message, imageUrl, fields, designedBy };
}

// ── 4-b) 카카오 "나에게 보내기" (콜백 없이 결과 전송) ───────────────────
async function getKakaoAccessToken() {
  const rk = (optionalSecret(KAKAO_REST_API_KEY) || "").trim();
  const rt = (optionalSecret(KAKAO_REFRESH_TOKEN) || "").trim();
  const body = { grant_type: "refresh_token", client_id: rk, refresh_token: rt };
  const cs = (optionalSecret(KAKAO_CLIENT_SECRET) || "").trim();
  if (cs) body.client_secret = cs;
  const res = await axios.post(
    "https://kauth.kakao.com/oauth/token",
    new URLSearchParams(body),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 8000 }
  );
  return res.data.access_token;
}

async function kakaoMemoSend(templateObject, accessToken) {
  await axios.post(
    "https://kapi.kakao.com/v2/api/talk/memo/default/send",
    new URLSearchParams({ template_object: JSON.stringify(templateObject) }),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 8000,
    }
  );
}

// 자보 이미지(feed) + 전체 문구(text)를 나와의 채팅으로 전송
async function sendPosterToMe(result) {
  const at = await getKakaoAccessToken();
  const title = result.fields.title || "행사 웹자보";
  await kakaoMemoSend(
    {
      object_type: "feed",
      content: {
        title: `🎨 ${title}`,
        description:
          "모이다가 만든 행사 웹자보입니다. 아래 버튼을 누르면 이미지 파일이 저장돼요.",
        image_url: result.imageUrl,
        image_width: 880,
        image_height: 1245,
        link: { web_url: result.imageUrl, mobile_web_url: result.imageUrl },
      },
      buttons: [
        {
          title: "📥 자보 다운로드",
          link: { web_url: result.imageUrl, mobile_web_url: result.imageUrl },
        },
      ],
    },
    at
  );
  // 전체 문구 + 원본 링크(외부 브라우저로 열어 저장 가능)
  await kakaoMemoSend(
    {
      object_type: "text",
      text: `${result.message}\n\n🖼️ 자보 원본 링크\n${result.imageUrl}`,
      link: { web_url: result.imageUrl, mobile_web_url: result.imageUrl },
      button_title: "📥 자보 다운로드",
    },
    at
  );
}

// ── 5) 콜백 워커: kakaoSkill 호출 → 자보 생성 후 "나에게 보내기"(+콜백) ────
exports.posterWorker = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 120,
    memory: "512MiB",
    secrets: [
      ANTHROPIC_API_KEY,
      ANTHROPIC_BASE_URL,
      ANTHROPIC_MODEL,
      OPENAI_API_KEY,
      KAKAO_REST_API_KEY,
      KAKAO_REFRESH_TOKEN,
      KAKAO_CLIENT_SECRET,
    ],
  },
  async (req, res) => {
    const body = req.body || {};
    const callbackUrl = body.callbackUrl;
    try {
      const result = await buildPoster(
        {
          imageUrl: body.imageUrl,
          brief: body.brief,
          title: body.title,
          datetime: body.datetime,
          location: body.location,
        },
        {
          apiKey: optionalSecret(ANTHROPIC_API_KEY),
          baseURL: optionalSecret(ANTHROPIC_BASE_URL),
          model: optionalSecret(ANTHROPIC_MODEL),
          openaiKey: optionalSecret(OPENAI_API_KEY),
        }
      );

      const skillResponse = {
        version: "2.0",
        template: {
          outputs: [
            { simpleImage: { imageUrl: result.imageUrl, altText: result.fields.title || "행사 웹자보" } },
            { simpleText: { text: result.message } },
          ],
          quickReplies: [
            { label: "🎨 자보 또 만들기", action: "message", messageText: "웹자보 요청" },
            { label: "📋 일정 보기", action: "message", messageText: "오늘 일정은?" },
          ],
        },
      };

      console.log(
        "posterWorker done:",
        result.imageUrl,
        "| callbackUrl present:",
        !!callbackUrl
      );

      // 봇방 '결과 받기' 폴링용 결과 저장 (콜백 없이도 채널에서 받기 가능)
      const uid = body.uid ? String(body.uid) : "";
      if (uid) {
        try {
          await admin.firestore().collection("posterResults").doc(uid).set({
            imageUrl: result.imageUrl,
            message: result.message,
            title: result.fields.title || "행사 웹자보",
            createdAt: Date.now(),
          });
          console.log("posterResults 저장 완료:", uid);
        } catch (e) {
          console.warn("posterResults 저장 실패:", e.message);
        }
      }

      // 콜백이 있으면 채널로 즉시 회신. 없으면 봇방은 '결과 받기' 버튼으로 받고,
      // 나에게 보내기는 백업으로 함께 발송.
      if (callbackUrl) {
        try {
          await axios.post(callbackUrl, skillResponse, {
            headers: { "Content-Type": "application/json" },
            timeout: 8000,
          });
          console.log("posterWorker callback POSTED (채널 회신)");
        } catch (e) {
          console.warn("콜백 전송 실패 → 나에게 보내기로 폴백:", e.message);
          try {
            await sendPosterToMe(result);
          } catch (_) {}
        }
      } else {
        try {
          await sendPosterToMe(result);
          console.log("posterWorker 나에게 보내기 백업 전송 완료");
        } catch (e) {
          const detail = e.response ? JSON.stringify(e.response.data) : e.message;
          console.error("나에게 보내기 전송 실패:", detail);
        }
      }

      res.json({ ok: true, imageUrl: result.imageUrl });
    } catch (e) {
      console.error("posterWorker FAILED:", e.message);
      if (callbackUrl) {
        try {
          await axios.post(
            callbackUrl,
            {
              version: "2.0",
              template: {
                outputs: [
                  {
                    simpleText: {
                      text:
                        "자보 생성 중 문제가 생겼어요 😢\n잠시 후 \"웹자보 요청\"으로 다시 시도해 주세요.",
                    },
                  },
                ],
              },
            },
            { headers: { "Content-Type": "application/json" }, timeout: 8000 }
          );
        } catch (_) {}
      }
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

// ── 6) Firestore 폴백 이미지 서빙 ──────────────────────────────────────
exports.posterImage = onRequest({ region: "asia-northeast3" }, async (req, res) => {
  try {
    const id = String(req.query.id || "");
    if (!id) return res.status(400).send("id required");
    const snap = await admin.firestore().collection("posterImages").doc(id).get();
    if (!snap.exists) return res.status(404).send("not found");
    const data = snap.data();
    const buf = Buffer.from(data.b64, "base64");
    res.set("Content-Type", data.contentType || "image/png");
    res.set("Cache-Control", "public, max-age=31536000");
    res.send(buf);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// ── 7) 디자인 미리보기용 테스트 함수 (카카오 안 거침) ─────────────────────
exports.testPoster = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 120,
    memory: "512MiB",
    secrets: [
      ANTHROPIC_API_KEY,
      ANTHROPIC_BASE_URL,
      ANTHROPIC_MODEL,
      OPENAI_API_KEY,
    ],
  },
  async (req, res) => {
    try {
      const brief =
        req.query.brief ||
        "행사명: 청년 일자리 정책 간담회\n일시: 2026년 7월 3일(목) 오후 2시\n장소: 국회의원회관 제2세미나실\n내용: 지역 청년들과 함께 일자리 정책의 현장 목소리를 듣고 개선 방안을 논의하는 간담회를 개최합니다. 청년 창업·취업 지원 확대 방안을 중점적으로 다룹니다.";
      const imageUrl = req.query.image || "";

      // 디버그: OpenAI 키/호출 점검
      if (req.query.format === "oai") {
        const key = optionalSecret(OPENAI_API_KEY);
        if (!key) return res.json({ ok: false, reason: "OPENAI_API_KEY 시크릿 없음" });
        try {
          const txt = await openaiChat(
            "You are a test bot.",
            "Reply with exactly: OK",
            { apiKey: key, model: "gpt-4o-mini", maxTokens: 10, timeout: 20000 }
          );
          return res.json({ ok: true, keyLen: key.length, reply: txt });
        } catch (e) {
          return res.json({
            ok: false,
            keyLen: key.length,
            status: e.response && e.response.status,
            data: e.response && e.response.data,
            msg: e.message,
          });
        }
      }

      // 디버그: AI가 생성한 원본 SVG를 그대로 반환(로컬에서 렌더해 확인용)
      if (req.query.format === "svg") {
        const fields = parseBriefFields(String(brief));
        const svg = await generateSvgDesign(fields, {
          apiKey: optionalSecret(ANTHROPIC_API_KEY),
          baseURL: optionalSecret(ANTHROPIC_BASE_URL),
          model: optionalSecret(ANTHROPIC_MODEL),
          openaiKey: optionalSecret(OPENAI_API_KEY),
        });
        res.set("Content-Type", "text/plain; charset=utf-8");
        return res.send(svg || "(AI 디자인 생성 실패/널 — 템플릿으로 폴백됨)");
      }

      const result = await buildPoster(
        { brief: String(brief), imageUrl: String(imageUrl) },
        {
          apiKey: optionalSecret(ANTHROPIC_API_KEY),
          baseURL: optionalSecret(ANTHROPIC_BASE_URL),
          model: optionalSecret(ANTHROPIC_MODEL),
          openaiKey: optionalSecret(OPENAI_API_KEY),
          freeDesign: req.query.free === "1",
        }
      );
      if (req.query.format === "json") {
        return res.json({
          ok: true,
          designedBy: result.designedBy,
          imageUrl: result.imageUrl,
          message: result.message,
        });
      }
      // 사람이 보기 좋게 미리보기 HTML
      res.set("Content-Type", "text/html; charset=utf-8");
      res.send(
        `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
          `<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px;background:#f5f6f8">` +
          `<h3>웹자보 미리보기</h3>` +
          `<img src="${result.imageUrl}" style="width:100%;border:1px solid #ddd;border-radius:12px">` +
          `<h4>홍보 문구</h4>` +
          `<pre style="white-space:pre-wrap;background:#fff;padding:16px;border-radius:12px;border:1px solid #eee">${escapeXml(result.message)}</pre>` +
          `<p style="color:#888;font-size:13px">이미지 URL: <a href="${result.imageUrl}">${result.imageUrl}</a></p>` +
          `</body></html>`
      );
    } catch (e) {
      console.error("testPoster error:", e);
      res.status(500).send("오류: " + e.message);
    }
  }
);

// 내보내기 (kakaoSkill에서 사용)
module.exports.buildPoster = buildPoster;
module.exports.parseBriefFields = parseBriefFields;
// 로컬 디자인 테스트용
module.exports._buildSvg = buildSvg;
module.exports._renderPng = renderPng;
