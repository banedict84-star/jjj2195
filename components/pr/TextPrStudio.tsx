"use client";

import { useMemo, useState } from "react";
import { useCollection } from "@/lib/store/useDB";
import { insert, remove, newId, nowISO } from "@/lib/store/db";
import type { PrType } from "@/lib/store/types";
import { aiHeaders } from "@/lib/openai/userKey";
import { Badge } from "@/components/ui/primitives";

const TYPES: Exclude<PrType, "웹자보">[] = ["보도자료", "SNS", "문자"];
const TONES = ["공식", "친근", "강조"] as const;
const inputCls =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export default function TextPrStudio() {
  const all = useCollection("prContents");
  const [type, setType] = useState<(typeof TYPES)[number]>("보도자료");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number]>("공식");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved = useMemo(
    () =>
      all
        .filter((p) => p.type === type)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [all, type]
  );

  async function generate() {
    if (!topic.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pr/text", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...aiHeaders() },
        body: JSON.stringify({ type, topic, tone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "생성 실패");
      setBody(json.data.body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setLoading(false);
    }
  }

  function save() {
    if (!body.trim()) return;
    insert("prContents", {
      id: newId(),
      type,
      title: topic || `${type} 초안`,
      body,
      status: "초안",
      createdAt: nowISO(),
    });
    setBody("");
    setTopic("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex gap-2">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                type === t
                  ? "border-brand font-semibold text-brand"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={`${type} 주제 (예: 청년 일자리 간담회 개최)`}
          className={inputCls}
        />
        <div className="flex gap-2">
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as typeof tone)}
            className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
          >
            {TONES.map((t) => (
              <option key={t}>{t} 톤</option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={loading || !topic.trim()}
            className="flex-1 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
          >
            {loading ? "생성 중…" : `✨ ${type} 생성`}
          </button>
        </div>
        {error && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {error}
          </p>
        )}

        <textarea
          rows={14}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="생성 결과가 여기에 표시됩니다. 직접 입력·수정도 가능합니다."
          className={inputCls}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => navigator.clipboard?.writeText(body)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            복사
          </button>
          <button
            onClick={save}
            disabled={!body.trim()}
            className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand hover:text-white disabled:opacity-40"
          >
            저장
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          저장된 {type} ({saved.length})
        </h3>
        {saved.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
            저장된 항목이 없습니다.
          </p>
        ) : (
          <div className="space-y-2">
            {saved.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge tone="violet">{p.status}</Badge>
                    <span className="text-sm font-medium">{p.title}</span>
                  </div>
                  <button
                    onClick={() => remove("prContents", p.id)}
                    className="text-xs text-rose-500 hover:underline"
                  >
                    삭제
                  </button>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-xs text-slate-600">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
