"use client";

import { useRef, useState } from "react";
import ResultCard from "@/components/secretary/ResultCard";
import type { SecretaryResult } from "@/lib/validators/secretary";
import { useDB } from "@/lib/store/useDB";
import { insert, newId, nowISO } from "@/lib/store/db";
import { localAnalyze } from "@/lib/secretary/localAnalyze";
import { aiHeaders } from "@/lib/openai/userKey";
import { buildContext } from "@/lib/secretary/context";
import type { SecretaryAction } from "@/lib/validators/secretary";
import { useSpeech } from "@/lib/useSpeech";

const EXAMPLES = [
  "내일 오후 2시 행신동 주민간담회 일정 잡아줘",
  "공무원 누구 등록되어 있어?",
  "오늘 들어온 교통 민원들 정리하고 처리 방향 알려줘",
  "최근 우리 지역 부정 뉴스 모니터링하고 대응안 제안해줘",
];

interface HistoryItem {
  input: string;
  result: SecretaryResult;
  offline?: boolean;
  done?: string; // 실제 수행한 동작 안내 (예: "일정에 등록했습니다")
}

/** AI 가 지시한 동작을 실제 데이터에 반영하고 안내 문구를 반환 */
function runAction(action?: SecretaryAction): string | undefined {
  if (!action || action.kind === "none") return undefined;
  if (action.kind === "create_event") {
    insert("events", {
      id: newId(),
      title: action.title || "새 일정",
      type: "행사",
      location: action.location || "",
      startAt: action.datetime || "",
      description: action.detail || "",
      status: "예정",
      attendees: [],
      report: "",
      createdAt: nowISO(),
    });
    const when = action.datetime
      ? new Date(action.datetime).toLocaleString("ko-KR", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    return `📅 일정에 등록했습니다: ${action.title}${when ? ` (${when})` : ""}`;
  }
  if (action.kind === "create_minwon") {
    insert("minwon", {
      id: newId(),
      title: action.title || "새 민원",
      content: action.detail || "",
      personName: "",
      category: "기타",
      status: "접수",
      priority: "보통",
      assignee: "",
      dueDate: "",
      createdAt: nowISO(),
    });
    return `📮 민원으로 등록했습니다: ${action.title}`;
  }
  return undefined;
}

export default function SecretaryPage() {
  const db = useDB();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [voiceChat, setVoiceChat] = useState(false);
  const voiceChatRef = useRef(false);
  voiceChatRef.current = voiceChat;

  const speechRef = useRef<ReturnType<typeof useSpeech> | null>(null);

  // 음성 답변을 읽어주고, 끝나면 다시 듣기(핸즈프리 대화 루프)
  function speakAnswer(result: SecretaryResult, done?: string) {
    const sp = speechRef.current;
    if (!sp || !voiceChatRef.current) return;
    const text = [done, result.summary, result.recommendation]
      .filter(Boolean)
      .join(". ");
    sp.speak(text, () => {
      if (voiceChatRef.current) sp.start();
    });
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/secretary", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...aiHeaders() },
        body: JSON.stringify({
          input: trimmed,
          context: buildContext(db),
          now: new Date().toString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // OpenAI 미가용(키 없음/네트워크 차단) → 로컬 데이터 기반 폴백 분석
        const result = localAnalyze(trimmed, db);
        setHistory((h) => [{ input: trimmed, result, offline: true }, ...h]);
        setInput("");
        speakAnswer(result);
        return;
      }
      const result: SecretaryResult = json.data;
      const done = runAction(result.action);
      setHistory((h) => [{ input: trimmed, result, done }, ...h]);
      setInput("");
      speakAnswer(result, done);
    } catch {
      const result = localAnalyze(trimmed, db);
      setHistory((h) => [{ input: trimmed, result, offline: true }, ...h]);
      setInput("");
      speakAnswer(result);
    } finally {
      setLoading(false);
    }
  }

  const speech = useSpeech({
    onResult: (text) => setInput(text),
    onEnd: (finalText) => {
      // 음성 대화 모드: 말이 끝나면 자동 전송
      if (voiceChatRef.current && finalText.trim()) submit(finalText);
    },
  });
  speechRef.current = speech;
  const { supported: micSupported, listening, start, stop, cancelSpeak } =
    speech;

  function toggleVoiceChat() {
    if (voiceChat) {
      setVoiceChat(false);
      stop();
      cancelSpeak();
    } else {
      setVoiceChat(true);
      start();
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-2xl font-bold">AI 비서실장</h1>
      <p className="mb-6 text-sm text-slate-500">
        업무 요청을 자연어로 입력하면 분석해 드리고,{" "}
        <b className="text-slate-600">“일정/민원 등록해줘”</b> 라고 하면 실제로 등록까지 해드립니다.
      </p>

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
          placeholder="예: 오늘 민원 정리해줘"
          className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {voiceChat
              ? listening
                ? "🎙️ 말씀하세요…"
                : "🔊 답변 중…"
              : listening
                ? "🎙️ 듣고 있어요…"
                : "⌘/Ctrl + Enter 로 전송"}
          </span>
          <div className="flex items-center gap-2">
            {micSupported && (
              <>
                <button
                  type="button"
                  onClick={toggleVoiceChat}
                  aria-label="음성 대화 모드"
                  title="음성으로 대화 (말하면 자동 전송 + 답변 읽어줌)"
                  className={`flex h-9 items-center gap-1 rounded-lg border px-2.5 text-sm transition ${
                    voiceChat
                      ? "border-brand bg-brand text-white"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  🔊 대화
                </button>
                <button
                  type="button"
                  onClick={() => (listening ? stop() : start())}
                  aria-label="음성 입력"
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition ${
                    listening
                      ? "animate-pulse border-rose-300 bg-rose-50 text-rose-600"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  🎤
                </button>
              </>
            )}
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "분석 중…" : "요청 보내기"}
            </button>
          </div>
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
            <div className="mb-2 flex items-center gap-2">
              <p className="text-sm font-medium text-slate-500">
                “{item.input}”
              </p>
              {item.offline && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                  오프라인 분석(로컬 데이터)
                </span>
              )}
            </div>
            {item.done && (
              <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
                ✅ {item.done}
              </div>
            )}
            <ResultCard result={item.result} />
          </div>
        ))}
      </div>
    </main>
  );
}
