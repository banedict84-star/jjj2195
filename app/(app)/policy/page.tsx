"use client";

import { useMemo, useState } from "react";
import { useCollection } from "@/lib/store/useDB";
import { insert, update, remove, newId, nowISO } from "@/lib/store/db";
import type { PolicyItem, PolicyStatus, PolicyType } from "@/lib/store/types";
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

const TYPES: PolicyType[] = ["5분발언", "도정질문", "조례검토"];
const STATUSES: PolicyStatus[] = ["작성중", "검토", "완료"];
const STATUS_TONE: Record<PolicyStatus, string> = {
  작성중: "amber",
  검토: "blue",
  완료: "green",
};

const empty = (): PolicyItem => ({
  id: "",
  type: "5분발언",
  title: "",
  content: "",
  source: "",
  status: "작성중",
  createdAt: "",
});

export default function PolicyPage() {
  const items = useCollection("policyItems");
  const [type, setType] = useState<string>("");
  const [edit, setEdit] = useState<PolicyItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const filtered = useMemo(
    () => items.filter((i) => !type || i.type === type),
    [items, type]
  );

  function save() {
    if (!edit || !edit.title.trim()) return;
    if (edit.id) update("policyItems", edit.id, edit);
    else insert("policyItems", { ...edit, id: newId(), createdAt: nowISO() });
    setEdit(null);
    setNote(null);
  }

  async function aiDraft() {
    if (!edit || !edit.title.trim() || loading) return;
    setLoading(true);
    setNote(null);
    try {
      const res = await fetch("/api/policy/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: edit.type,
          title: edit.title,
          source: edit.source,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "생성 실패");
      setEdit({ ...edit, content: json.data.content });
    } catch (e) {
      setNote(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title="정책 지원"
        desc="5분발언·도정질문·조례검토 초안을 작성하고 관리합니다."
        action={
          <PrimaryButton onClick={() => setEdit(empty())}>
            + 새 문서
          </PrimaryButton>
        }
      />

      <div className="mb-4 flex gap-2">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(type === t ? "" : t)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              type === t
                ? "border-brand font-semibold text-brand"
                : "border-slate-200 text-slate-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="문서가 없습니다." />
      ) : (
        <div className="space-y-2">
          {filtered.map((i) => (
            <div
              key={i.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge tone="violet">{i.type}</Badge>
                    <Badge tone={STATUS_TONE[i.status]}>{i.status}</Badge>
                    <span className="font-semibold">{i.title}</span>
                  </div>
                  <p className="line-clamp-2 whitespace-pre-wrap text-sm text-slate-600">
                    {i.content || "(내용 없음)"}
                  </p>
                </div>
                <div className="shrink-0 text-xs">
                  <button
                    onClick={() => setEdit(i)}
                    className="mr-2 text-slate-500 hover:underline"
                  >
                    열기
                  </button>
                  <button
                    onClick={() => remove("policyItems", i.id)}
                    className="text-rose-500 hover:underline"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "정책 문서" : "새 정책 문서"}
        footer={
          <>
            <GhostButton onClick={() => setEdit(null)}>취소</GhostButton>
            <PrimaryButton onClick={save}>저장</PrimaryButton>
          </>
        }
      >
        {edit && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="유형">
                <select
                  className={inputCls}
                  value={edit.type}
                  onChange={(e) =>
                    setEdit({ ...edit, type: e.target.value as PolicyType })
                  }
                >
                  {TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="상태">
                <select
                  className={inputCls}
                  value={edit.status}
                  onChange={(e) =>
                    setEdit({ ...edit, status: e.target.value as PolicyStatus })
                  }
                >
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="제목">
              <input
                className={inputCls}
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            <Field label="참고자료 (선택)">
              <input
                className={inputCls}
                value={edit.source}
                onChange={(e) => setEdit({ ...edit, source: e.target.value })}
              />
            </Field>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">내용</span>
                <button
                  onClick={aiDraft}
                  disabled={loading || !edit.title.trim()}
                  className="rounded-lg border border-brand px-3 py-1 text-xs font-semibold text-brand transition hover:bg-brand hover:text-white disabled:opacity-40"
                >
                  {loading ? "생성 중…" : "✨ AI 초안"}
                </button>
              </div>
              <textarea
                className={inputCls}
                rows={10}
                value={edit.content}
                onChange={(e) => setEdit({ ...edit, content: e.target.value })}
              />
              {note && (
                <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {note}
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}
