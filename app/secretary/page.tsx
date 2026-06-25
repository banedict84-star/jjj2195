"use client";

import { useState } from "react";
import Link from "next/link";
import ResultCard from "@/components/secretary/ResultCard";
import type { SecretaryResult } from "@/lib/validators/secretary";

const EXAMPLES = [
  "오늘 들어온 교통 민원들 정리하고 처리 방향 알려줘",
  "다음 주 청년정책 간담회 보도자료 초안 잡아줘",
  "최근 우리 지역 부정 뉴스 모니터링하고 대응안 제안해줘",
  "이번 달 의정활동 일정 점검하고 누락된 거 있는지 봐줘",
];

interface HistoryItem {
  input: string;
  result: SecretaryResult;
}

export default function SecretaryPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/secretary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "요청에 실패했습니다.");
      }
      setHistory((h) => [{ input: trimmed, result: json.data }, ...h]);
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-slate-400 hover:text-slate-600">
            ← 장윤정 AI 비서실
          </Link>
          <h1 className="mt-1 text-2xl font-bold">AI 비서실장</h1>
        </div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit(input);
            }
          }}
          rows={3}
          placeholder="의원실 업무 요청을 자연어로 입력하세요. (예: 오늘 민원 정리해줘)"
          className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-slate-400">⌘/Ctrl + Enter 로 전송</span>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "분석 중…" : "요청 보내기"}
          </button>
        </div>
      </form>

      {history.length === 0 && !loading && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium text-slate-400">예시 요청</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => submit(ex)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-brand hover:text-brand"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-6">
        {loading && (
          <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-400">
            AI 비서실장이 요청을 분석하고 있습니다…
          </div>
        )}
        {history.map((item, i) => (
          <div key={i}>
            <p className="mb-2 text-sm font-medium text-slate-500">
              “{item.input}”
            </p>
            <ResultCard result={item.result} />
          </div>
        ))}
      </div>
    </main>
  );
}
