import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <p className="mb-2 text-sm font-medium text-brand">의원실 통합 업무 관리 플랫폼</p>
        <h1 className="text-4xl font-bold tracking-tight">장윤정 AI 비서실</h1>
        <p className="mt-4 text-slate-600">
          민원 · 조직 · 일정 · 홍보 · 정책 · 뉴스 업무를 AI 비서실장이 분석하고
          <br className="hidden sm:block" />
          핵심요약 · 상황분석 · 추천행동 · 다음할일로 정리해 드립니다.
        </p>
      </div>
      <Link
        href="/secretary"
        className="rounded-lg bg-brand px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-dark"
      >
        AI 비서실장 시작하기 →
      </Link>
    </main>
  );
}
