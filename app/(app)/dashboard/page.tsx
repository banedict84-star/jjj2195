import Link from "next/link";
import ResultCard from "@/components/secretary/ResultCard";
import {
  SAMPLE_KPIS,
  SAMPLE_ACTIVITY,
  SAMPLE_BRIEFING,
} from "@/lib/sample/dashboard";

const TONE: Record<string, string> = {
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
};

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">대시보드</h1>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
          샘플 데이터 — Supabase 연동 시 실데이터로 대체
        </span>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {SAMPLE_KPIS.map((kpi) => (
          <Link
            key={kpi.label}
            href={kpi.href}
            className={`rounded-xl border p-4 transition hover:shadow-sm ${TONE[kpi.tone]}`}
          >
            <p className="text-xs font-medium opacity-80">{kpi.label}</p>
            <p className="mt-1 text-3xl font-bold">
              {kpi.value}
              <span className="ml-1 text-base font-medium opacity-70">
                {kpi.unit}
              </span>
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        {/* 오늘의 AI 브리핑 */}
        <section className="lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              오늘의 AI 브리핑
            </h2>
            <Link
              href="/secretary"
              className="text-xs text-brand hover:underline"
            >
              AI 비서실장 열기 →
            </Link>
          </div>
          <ResultCard result={SAMPLE_BRIEFING} />
        </section>

        {/* 최근 활동 */}
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">최근 활동</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <ul className="space-y-3">
              {SAMPLE_ACTIVITY.map((a, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-10 shrink-0 text-xs text-slate-400">
                    {a.time}
                  </span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    {a.category}
                  </span>
                  <span className="text-slate-700">{a.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
