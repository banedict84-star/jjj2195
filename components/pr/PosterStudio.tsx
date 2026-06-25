"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import PosterPreview from "@/components/pr/PosterPreview";
import { POSTER_THEMES } from "@/lib/pr/themes";
import type { PosterContent } from "@/lib/validators/pr";
import { insert, newId, nowISO } from "@/lib/store/db";

const DEFAULT_CONTENT: PosterContent = {
  headline: "청년 일자리 정책 간담회",
  subhead: "주민 여러분을 초대합니다",
  points: ["지역 청년 채용 확대 방안", "현장의 목소리를 정책에 반영"],
  hashtags: ["청년일자리", "주민과함께", "장윤정"],
  cta: "7월 3일(목) 14:00 · 행신동 주민센터",
};

const TONES = ["공식", "친근", "강조"] as const;
const inputCls =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export default function PosterStudio() {
  const [topic, setTopic] = useState("");
  const [keyMessage, setKeyMessage] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number]>("공식");
  const [org, setOrg] = useState("도의원 장윤정");
  const [content, setContent] = useState<PosterContent>(DEFAULT_CONTENT);
  const [themeId, setThemeId] = useState(POSTER_THEMES[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const posterRef = useRef<HTMLDivElement>(null);
  const theme = POSTER_THEMES.find((t) => t.id === themeId) ?? POSTER_THEMES[0];

  async function generate() {
    if (!topic.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pr/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, keyMessage, tone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "생성에 실패했습니다.");
      setContent(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function download() {
    if (!posterRef.current) return;
    const dataUrl = await toPng(posterRef.current, { pixelRatio: 1, cacheBust: true });
    const a = document.createElement("a");
    a.download = `웹자보_${topic.trim() || "poster"}.png`;
    a.href = dataUrl;
    a.click();
  }

  function saveDraft() {
    insert("prContents", {
      id: newId(),
      type: "웹자보",
      title: content.headline,
      body: [content.subhead, ...content.points, content.cta].join("\n"),
      status: "초안",
      createdAt: nowISO(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const set = (patch: Partial<PosterContent>) =>
    setContent((c) => ({ ...c, ...patch }));

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
      <div className="space-y-5">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">1. AI 문구 생성</h2>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="주제 (예: 청년 일자리 정책 간담회 개최)"
            className={`mb-2 ${inputCls}`}
          />
          <input
            value={keyMessage}
            onChange={(e) => setKeyMessage(e.target.value)}
            placeholder="핵심 메시지 (선택)"
            className={`mb-2 ${inputCls}`}
          />
          <div className="flex items-center gap-2">
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as typeof tone)}
              className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t} 톤
                </option>
              ))}
            </select>
            <button
              onClick={generate}
              disabled={loading || !topic.trim()}
              className="flex-1 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
            >
              {loading ? "생성 중…" : "✨ AI로 문구 생성"}
            </button>
          </div>
          {error && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {error} 아래에서 문구를 직접 입력해도 포스터를 만들 수 있습니다.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">2. 문구 편집</h2>
          <div className="space-y-3 text-sm">
            <LabeledInput label="발신 주체" value={org} onChange={setOrg} />
            <LabeledInput label="부제" value={content.subhead} onChange={(v) => set({ subhead: v })} />
            <LabeledInput label="헤드라인" value={content.headline} onChange={(v) => set({ headline: v })} />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                핵심 문구 (한 줄에 하나)
              </span>
              <textarea
                rows={3}
                value={content.points.join("\n")}
                onChange={(e) => set({ points: e.target.value.split("\n") })}
                className={inputCls}
              />
            </label>
            <LabeledInput label="안내 문구(CTA)" value={content.cta} onChange={(v) => set({ cta: v })} />
            <LabeledInput
              label="해시태그 (쉼표로 구분)"
              value={content.hashtags.join(", ")}
              onChange={(v) =>
                set({ hashtags: v.split(",").map((s) => s.trim()).filter(Boolean) })
              }
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">3. 템플릿</h2>
          <div className="flex flex-wrap gap-2">
            {POSTER_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setThemeId(t.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                  themeId === t.id
                    ? "border-brand font-semibold text-brand"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <span
                  className="mr-1.5 inline-block h-3 w-3 rounded-full align-middle"
                  style={{ background: t.background }}
                />
                {t.name}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">미리보기</h2>
          <div className="flex gap-2">
            <button
              onClick={saveDraft}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              {saved ? "저장됨 ✓" : "초안 저장"}
            </button>
            <button
              onClick={download}
              className="rounded-lg border border-brand px-4 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand hover:text-white"
            >
              ⬇ PNG
            </button>
          </div>
        </div>
        <div
          className="overflow-hidden rounded-xl border border-slate-200 shadow-sm"
          style={{ width: 400, height: 500 }}
        >
          <div style={{ transform: "scale(0.37037)", transformOrigin: "top left" }}>
            <PosterPreview ref={posterRef} content={content} theme={theme} org={org} />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          내려받는 이미지는 1080 × 1350 (SNS 4:5) 고해상도입니다.
        </p>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  );
}
