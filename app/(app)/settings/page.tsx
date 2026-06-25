"use client";

import { useEffect, useState } from "react";
import {
  getStoredKey,
  setStoredKey,
  clearStoredKey,
} from "@/lib/openai/userKey";
import { PageHeader, PrimaryButton } from "@/components/ui/primitives";

export default function SettingsPage() {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(
    null
  );

  useEffect(() => {
    setKey(getStoredKey());
  }, []);

  const masked =
    key && key.length > 12
      ? key.slice(0, 7) + "…" + key.slice(-4)
      : key;

  function save() {
    setStoredKey(key);
    setSaved(true);
    setResult(null);
    setTimeout(() => setSaved(false), 1500);
  }

  function clear() {
    clearStoredKey();
    setKey("");
    setResult(null);
  }

  async function test() {
    setTesting(true);
    setResult(null);
    // 입력 중인 키를 우선 저장 후 테스트
    setStoredKey(key);
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key.trim() ? { "x-openai-key": key.trim() } : {}),
        },
      });
      const json = await res.json();
      if (res.ok) {
        setResult({ ok: true, msg: `연결 성공! (${json.data.model})` });
      } else {
        setResult({ ok: false, msg: json?.error?.message ?? "연결 실패" });
      }
    } catch {
      setResult({ ok: false, msg: "네트워크 오류" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <PageHeader
        title="설정 · AI 연동"
        desc="OpenAI 키를 입력하면 AI 비서실장이 더 똑똑하게 답하고, 보도자료·SNS·정책문 자동작성이 켜집니다."
      />

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="mb-1 block text-sm font-medium text-slate-700">
          OpenAI API 키
        </label>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-... 키를 붙여넣으세요"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        {key && (
          <p className="mt-1 text-xs text-slate-400">현재 키: {masked}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryButton onClick={save}>
            {saved ? "저장됨 ✓" : "저장"}
          </PrimaryButton>
          <button
            onClick={test}
            disabled={testing || !key.trim()}
            className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand transition hover:bg-brand hover:text-white disabled:opacity-40"
          >
            {testing ? "테스트 중…" : "연결 테스트"}
          </button>
          {key && (
            <button
              onClick={clear}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50"
            >
              키 삭제
            </button>
          )}
        </div>

        {result && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              result.ok
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
            }`}
          >
            {result.ok ? "✅ " : "⚠️ "}
            {result.msg}
          </p>
        )}
      </section>

      <div className="mt-5 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        <p>
          🔒 키는 <b>이 브라우저(localStorage)에만</b> 저장됩니다. 코드 저장소나
          서버에 영구 저장되지 않으며, AI 요청을 보낼 때만 우리 서버로 전달되어
          사용됩니다.
        </p>
        <p>
          🔑 키가 없어도 AI 비서실장은 <b>로컬 데이터 분석</b>으로 정상
          동작합니다. 키를 넣으면 더 자유로운 대화와 문서 자동작성이 켜집니다.
        </p>
        <p>
          ⚠️ 보안을 위해 키는{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer"
            className="text-brand underline"
          >
            OpenAI 대시보드
          </a>
          에서 새로 발급받아 사용하시길 권장합니다.
        </p>
      </div>
    </main>
  );
}
