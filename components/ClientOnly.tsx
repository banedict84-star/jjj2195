"use client";

import { useEffect, useState, ReactNode } from "react";

/**
 * 클라이언트 마운트 후에만 children 을 렌더한다.
 * 이 앱은 데이터를 localStorage 에서 읽고 시간(new Date 등)에 의존하므로
 * SSR 결과와 클라이언트 결과가 달라 하이드레이션 불일치가 발생한다.
 * 서버와 클라 첫 렌더를 동일(스켈레톤)하게 맞춰 불일치를 제거한다.
 */
export default function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }
  return <>{children}</>;
}
