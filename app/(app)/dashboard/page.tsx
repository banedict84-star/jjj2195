"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useDB } from "@/lib/store/useDB";
import { localAnalyze } from "@/lib/secretary/localAnalyze";
import ResultCard from "@/components/secretary/ResultCard";

const TONE: Record<string, string> = {
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
};

function isToday(iso: string) {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

export default function DashboardPage() {
  const db = useDB();

  const kpis = useMemo(
    () => [
      {
        label: "미처리 민원",
        value: db.minwon.filter((m) => m.status !== "완료").length,
        unit: "건",
        href: "/minwon",
        tone: "rose",
      },
      {
        label: "오늘 일정",
        value: db.events.filter((e) => isToday(e.startAt)).length,
        unit: "건",
        href: "/schedule",
        tone: "sky",
      },
      {
        label: "부정 뉴스",
        value: db.newsItems.filter((n) => n.sentiment === "부정").length,
        unit: "건",
        href: "/news",
        tone: "amber",
      },
      {
        label: "발행대기 홍보",
        value: db.prContents.filter((p) => p.status !== "발행").length,
        unit: "건",
        href: "/pr",
        tone: "violet",
      },
    ],
    [db]
  );

  const briefing = useMemo(
    () => localAnalyze("오늘 일정과 현황 브리핑", db),
    [db]
  );

  const activity = useMemo(() => {
    const items: { time: string; category: string; text: string }[] = [];
    db.minwon.slice(0, 3).forEach((m) =>
      items.push({
        time: new Date(m.createdAt).toLocaleDateString("ko-KR", {
          month: "numeric",
          day: "numeric",
        }),
        category: "민원",
        text: `${m.title} (${m.status})`,
      })
    );
    db.events.slice(0, 2).forEach((e) =>
      items.push({
        time: new Date(e.startAt).toLocaleDateString("ko-KR", {
          month: "numeric",
          day: "numeric",
        }),
        category: "일정",
        text: `${e.title} · 참석 ${e.attendees.length}명`,
      })
    );
    db.newsItems
      .filter((n) => n.sentiment === "부정")
      .slice(0, 2)
      .forEach((n) =>
        items.push({ time: "최근", category: "뉴스", text: n.title })
      );
    return items;
  }, [db]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">대시보드</h1>
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
          실시간 (로컬 데이터)
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
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
        <section className="lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              오늘의 AI 브리핑
            </h2>
            <Link href="/secretary" className="text-xs text-brand hover:underline">
              AI 비서실장 열기 →
            </Link>
          </div>
          <ResultCard result={briefing} />
        </section>

        <section className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">최근 활동</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                활동 내역이 없습니다.
              </p>
            ) : (
              <ul className="space-y-3">
                {activity.map((a, i) => (
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
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
