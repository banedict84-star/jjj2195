"use client";

import { useMemo, useState } from "react";
import { useCollection } from "@/lib/store/useDB";
import { insert, remove, newId, nowISO } from "@/lib/store/db";
import type { NewsItem, Sentiment } from "@/lib/store/types";
import Modal from "@/components/ui/Modal";
import {
  Badge,
  EmptyState,
  Field,
  GhostButton,
  PageHeader,
  PrimaryButton,
  inputCls,
} from "@/components/ui/primitives";

const SENTIMENTS: Sentiment[] = ["긍정", "중립", "부정"];
const SENT_TONE: Record<Sentiment, string> = {
  긍정: "green",
  중립: "slate",
  부정: "red",
};

const empty = (): NewsItem => ({
  id: "",
  title: "",
  source: "",
  url: "",
  sentiment: "중립",
  keywords: [],
  summary: "",
  publishedAt: "",
  createdAt: "",
});

export default function NewsPage() {
  const news = useCollection("newsItems");
  const [sent, setSent] = useState<string>("");
  const [add, setAdd] = useState<NewsItem | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      news
        .filter((n) => !sent || n.sentiment === sent)
        .slice()
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    [news, sent]
  );

  const counts = useMemo(() => {
    const c = { 긍정: 0, 중립: 0, 부정: 0 } as Record<Sentiment, number>;
    news.forEach((n) => c[n.sentiment]++);
    return c;
  }, [news]);

  function save() {
    if (!add || !add.title.trim()) return;
    insert("newsItems", {
      ...add,
      id: newId(),
      createdAt: nowISO(),
      publishedAt: add.publishedAt || nowISO(),
    });
    setAdd(null);
  }

  // 아침/저녁 보고 생성 (로컬 규칙 기반, 4단 포맷)
  function buildReport(type: "아침" | "저녁") {
    const neg = news.filter((n) => n.sentiment === "부정");
    const pos = news.filter((n) => n.sentiment === "긍정");
    const lines = [
      `[${type}보고] 언론 모니터링 — ${new Date().toLocaleDateString("ko-KR")}`,
      "",
      `■ 핵심요약: 총 ${news.length}건 (긍정 ${counts.긍정} · 중립 ${counts.중립} · 부정 ${counts.부정})`,
      "",
      "■ 상황분석:",
      neg.length
        ? `- 부정 보도 ${neg.length}건: ${neg.map((n) => n.title).join(" / ")}`
        : "- 부정 보도 없음",
      pos.length
        ? `- 긍정 보도 ${pos.length}건: ${pos.map((n) => n.title).join(" / ")}`
        : "- 긍정 보도 없음",
      "",
      "■ 추천행동:",
      neg.length
        ? "- 부정 보도 사실관계 확인 후 필요 시 입장자료 준비"
        : "- 별도 대응 불필요, 모니터링 유지",
      "",
      "■ 다음 할 일:",
      "- 주요 키워드 추적 지속",
      neg.length ? "- 부정 보도 담당 기자 연락 검토" : "- 긍정 보도 SNS 확산 검토",
    ];
    setReport(lines.join("\n"));
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title="뉴스 · 언론 모니터링"
        desc="지역 뉴스를 수집·분류하고 아침/저녁 보고를 생성합니다."
        action={
          <div className="flex gap-2">
            <GhostButton onClick={() => buildReport("아침")}>
              ☀️ 아침보고
            </GhostButton>
            <GhostButton onClick={() => buildReport("저녁")}>
              🌙 저녁보고
            </GhostButton>
            <PrimaryButton onClick={() => setAdd(empty())}>
              + 뉴스 추가
            </PrimaryButton>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {SENTIMENTS.map((s) => (
          <button
            key={s}
            onClick={() => setSent(sent === s ? "" : s)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              sent === s
                ? "border-brand font-semibold text-brand"
                : "border-slate-200 text-slate-600"
            }`}
          >
            {s} {counts[s]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="뉴스가 없습니다." />
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <div
              key={n.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge tone={SENT_TONE[n.sentiment]}>{n.sentiment}</Badge>
                    <span className="font-semibold">{n.title}</span>
                  </div>
                  <p className="text-sm text-slate-600">{n.summary}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {n.source} · {new Date(n.publishedAt).toLocaleDateString("ko-KR")}
                    {n.keywords.length > 0 && ` · ${n.keywords.map((k) => "#" + k).join(" ")}`}
                  </p>
                </div>
                <button
                  onClick={() => remove("newsItems", n.id)}
                  className="shrink-0 text-xs text-rose-500 hover:underline"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 뉴스 추가 */}
      <Modal
        open={!!add}
        onClose={() => setAdd(null)}
        title="뉴스 추가"
        footer={
          <>
            <GhostButton onClick={() => setAdd(null)}>취소</GhostButton>
            <PrimaryButton onClick={save}>저장</PrimaryButton>
          </>
        }
      >
        {add && (
          <div className="space-y-3">
            <Field label="제목">
              <input
                className={inputCls}
                value={add.title}
                onChange={(e) => setAdd({ ...add, title: e.target.value })}
              />
            </Field>
            <Field label="요약">
              <textarea
                className={inputCls}
                rows={2}
                value={add.summary}
                onChange={(e) => setAdd({ ...add, summary: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="언론사">
                <input
                  className={inputCls}
                  value={add.source}
                  onChange={(e) => setAdd({ ...add, source: e.target.value })}
                />
              </Field>
              <Field label="감성">
                <select
                  className={inputCls}
                  value={add.sentiment}
                  onChange={(e) =>
                    setAdd({ ...add, sentiment: e.target.value as Sentiment })
                  }
                >
                  {SENTIMENTS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="키워드 (쉼표로 구분)">
              <input
                className={inputCls}
                value={add.keywords.join(", ")}
                onChange={(e) =>
                  setAdd({
                    ...add,
                    keywords: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* 보고 결과 */}
      <Modal
        open={!!report}
        onClose={() => setReport(null)}
        title="모니터링 보고"
        footer={
          <PrimaryButton
            onClick={() => {
              if (report) navigator.clipboard?.writeText(report);
            }}
          >
            복사
          </PrimaryButton>
        }
      >
        <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
          {report}
        </pre>
      </Modal>
    </main>
  );
}
