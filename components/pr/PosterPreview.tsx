import { forwardRef } from "react";
import type { PosterContent } from "@/lib/validators/pr";
import type { PosterTheme } from "@/lib/pr/themes";

interface Props {
  content: PosterContent;
  theme: PosterTheme;
  org?: string; // 발신 주체 (예: 도의원 장윤정)
}

/**
 * 웹자보 포스터(4:5, 1080x1350 기준). forwardRef 로 받은 DOM 을
 * html-to-image 가 PNG 로 내보낸다. 인라인 스타일을 사용해 캡처 정확도를 높인다.
 */
const PosterPreview = forwardRef<HTMLDivElement, Props>(function PosterPreview(
  { content, theme, org = "도의원 장윤정" },
  ref
) {
  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        height: 1350,
        background: theme.background,
        color: theme.text,
        padding: 96,
        display: "flex",
        flexDirection: "column",
        fontFamily:
          "'Pretendard', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif",
        // 미리보기 축소는 부모에서 transform: scale 로 처리
        transformOrigin: "top left",
      }}
    >
      {/* 상단: 발신 주체 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontSize: 40 }}>🏛️</span>
        <span style={{ fontSize: 34, fontWeight: 700, opacity: 0.9 }}>{org}</span>
      </div>

      {/* 중앙: 헤드라인/서브헤드 */}
      <div style={{ marginTop: 90, flex: 1 }}>
        <div
          style={{
            display: "inline-block",
            background: theme.accent,
            color: theme.accentText,
            fontSize: 32,
            fontWeight: 700,
            padding: "10px 24px",
            borderRadius: 999,
            marginBottom: 40,
          }}
        >
          {content.subhead || "알림"}
        </div>
        <h1
          style={{
            fontSize: 116,
            fontWeight: 800,
            lineHeight: 1.12,
            margin: 0,
            wordBreak: "keep-all",
          }}
        >
          {content.headline || "헤드라인을 입력하세요"}
        </h1>

        {/* 핵심 문구 */}
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "64px 0 0 0",
            display: "flex",
            flexDirection: "column",
            gap: 28,
          }}
        >
          {content.points.filter(Boolean).map((p, i) => (
            <li
              key={i}
              style={{ display: "flex", alignItems: "flex-start", gap: 20 }}
            >
              <span
                style={{
                  marginTop: 14,
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: theme.accent,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 46, fontWeight: 500, lineHeight: 1.3 }}>
                {p}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* 하단: CTA + 해시태그 */}
      <div style={{ marginTop: 60 }}>
        {content.cta && (
          <div
            style={{
              fontSize: 44,
              fontWeight: 700,
              padding: "28px 0",
              borderTop: `2px solid ${theme.text}`,
              opacity: 0.95,
            }}
          >
            {content.cta}
          </div>
        )}
        {content.hashtags.filter(Boolean).length > 0 && (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            {content.hashtags.filter(Boolean).map((h, i) => (
              <span key={i} style={{ fontSize: 32, opacity: 0.85 }}>
                #{h.replace(/^#/, "")}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default PosterPreview;
