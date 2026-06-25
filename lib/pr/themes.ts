/** 웹자보 템플릿(색상 테마). 추후 이미지 배경/로고 업로드로 확장. */
export interface PosterTheme {
  id: string;
  name: string;
  /** 인라인 스타일로 적용 (html-to-image 호환을 위해 CSS 변수 대신 직접 값 사용) */
  background: string;
  text: string;
  accent: string;
  accentText: string;
}

export const POSTER_THEMES: PosterTheme[] = [
  {
    id: "navy",
    name: "클래식 네이비",
    background: "linear-gradient(160deg, #0f2557 0%, #1e3a8a 100%)",
    text: "#ffffff",
    accent: "#fbbf24",
    accentText: "#0f2557",
  },
  {
    id: "green",
    name: "모던 그린",
    background: "linear-gradient(160deg, #064e3b 0%, #059669 100%)",
    text: "#ffffff",
    accent: "#f0fdf4",
    accentText: "#065f46",
  },
  {
    id: "crimson",
    name: "임팩트 레드",
    background: "linear-gradient(160deg, #7f1d1d 0%, #b91c1c 100%)",
    text: "#ffffff",
    accent: "#fde68a",
    accentText: "#7f1d1d",
  },
  {
    id: "light",
    name: "라이트 클린",
    background: "linear-gradient(160deg, #f8fafc 0%, #e2e8f0 100%)",
    text: "#0f172a",
    accent: "#1d4ed8",
    accentText: "#ffffff",
  },
];
