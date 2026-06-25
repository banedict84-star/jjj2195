import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "장윤정 AI 비서실",
  description: "의원실 통합 업무 관리 플랫폼 — AI 비서실장",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
