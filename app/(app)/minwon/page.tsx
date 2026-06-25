"use client";

import { useMemo, useState } from "react";
import { useCollection } from "@/lib/store/useDB";
import { insert, update, remove, newId, nowISO } from "@/lib/store/db";
import type { Minwon, MinwonStatus, Priority } from "@/lib/store/types";
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

const STATUSES: MinwonStatus[] = ["접수", "처리중", "완료", "보류"];
const PRIORITIES: Priority[] = ["긴급", "높음", "보통", "낮음"];
const CATEGORIES = ["교통", "복지", "환경", "안전", "기타"];

const STATUS_TONE: Record<MinwonStatus, string> = {
  접수: "blue",
  처리중: "amber",
  완료: "green",
  보류: "slate",
};
const PRIORITY_TONE: Record<Priority, string> = {
  긴급: "red",
  높음: "amber",
  보통: "slate",
  낮음: "slate",
};

const empty = (): Minwon => ({
  id: "",
  title: "",
  content: "",
  personName: "",
  category: "교통",
  status: "접수",
  priority: "보통",
  assignee: "",
  dueDate: "",
  createdAt: "",
});

export default function MinwonPage() {
  const minwon = useCollection("minwon");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [edit, setEdit] = useState<Minwon | null>(null);

  const stats = useMemo(() => {
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<
      MinwonStatus,
      number
    >;
    const byCat: Record<string, number> = {};
    for (const m of minwon) {
      byStatus[m.status]++;
      byCat[m.category] = (byCat[m.category] ?? 0) + 1;
    }
    return { byStatus, byCat };
  }, [minwon]);

  const filtered = useMemo(() => {
    const kw = q.trim();
    return minwon.filter(
      (m) =>
        (!status || m.status === status) &&
        (!kw || [m.title, m.content, m.personName].some((f) => f.includes(kw)))
    );
  }, [minwon, q, status]);

  function save() {
    if (!edit || !edit.title.trim()) return;
    if (edit.id) update("minwon", edit.id, edit);
    else insert("minwon", { ...edit, id: newId(), createdAt: nowISO() });
    setEdit(null);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title="민원 관리"
        desc="지역 민원을 접수·처리하고 현황을 통계로 확인합니다."
        action={
          <PrimaryButton onClick={() => setEdit(empty())}>
            + 민원 접수
          </PrimaryButton>
        }
      />

      {/* 통계 */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(status === s ? "" : s)}
            className={`rounded-xl border p-3 text-left transition ${
              status === s
                ? "border-brand ring-1 ring-brand"
                : "border-slate-200 hover:border-slate-300"
            } bg-white`}
          >
            <p className="text-xs text-slate-500">{s}</p>
            <p className="text-2xl font-bold">{stats.byStatus[s]}</p>
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        분야별:
        {Object.entries(stats.byCat).map(([c, n]) => (
          <Badge key={c}>{`${c} ${n}`}</Badge>
        ))}
      </div>

      <div className="mb-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제목·내용·민원인 검색"
          className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        {status && (
          <button
            onClick={() => setStatus("")}
            className="text-xs text-slate-400 hover:underline"
          >
            필터 해제 ({status})
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="민원이 없습니다." />
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge tone={PRIORITY_TONE[m.priority]}>{m.priority}</Badge>
                    <Badge>{m.category}</Badge>
                    <span className="truncate font-semibold">{m.title}</span>
                  </div>
                  <p className="text-sm text-slate-600">{m.content}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    민원인 {m.personName || "-"} · 담당 {m.assignee || "미배정"} ·
                    마감 {m.dueDate || "-"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <select
                    value={m.status}
                    onChange={(e) =>
                      update("minwon", m.id, {
                        status: e.target.value as MinwonStatus,
                      })
                    }
                    className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${
                      {
                        blue: "bg-sky-100 text-sky-700",
                        amber: "bg-amber-100 text-amber-700",
                        green: "bg-emerald-100 text-emerald-700",
                        slate: "bg-slate-100 text-slate-600",
                      }[STATUS_TONE[m.status]]
                    }`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <div className="text-xs">
                    <button
                      onClick={() => setEdit(m)}
                      className="mr-2 text-slate-500 hover:underline"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => remove("minwon", m.id)}
                      className="text-rose-500 hover:underline"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "민원 수정" : "민원 접수"}
        footer={
          <>
            <GhostButton onClick={() => setEdit(null)}>취소</GhostButton>
            <PrimaryButton onClick={save}>저장</PrimaryButton>
          </>
        }
      >
        {edit && (
          <div className="space-y-3">
            <Field label="제목">
              <input
                className={inputCls}
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            <Field label="내용">
              <textarea
                className={inputCls}
                rows={3}
                value={edit.content}
                onChange={(e) => setEdit({ ...edit, content: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="민원인">
                <input
                  className={inputCls}
                  value={edit.personName}
                  onChange={(e) =>
                    setEdit({ ...edit, personName: e.target.value })
                  }
                />
              </Field>
              <Field label="분야">
                <select
                  className={inputCls}
                  value={edit.category}
                  onChange={(e) =>
                    setEdit({ ...edit, category: e.target.value })
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="우선순위">
                <select
                  className={inputCls}
                  value={edit.priority}
                  onChange={(e) =>
                    setEdit({ ...edit, priority: e.target.value as Priority })
                  }
                >
                  {PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="상태">
                <select
                  className={inputCls}
                  value={edit.status}
                  onChange={(e) =>
                    setEdit({ ...edit, status: e.target.value as MinwonStatus })
                  }
                >
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="담당자">
                <input
                  className={inputCls}
                  value={edit.assignee}
                  onChange={(e) =>
                    setEdit({ ...edit, assignee: e.target.value })
                  }
                />
              </Field>
              <Field label="마감일">
                <input
                  type="date"
                  className={inputCls}
                  value={edit.dueDate}
                  onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })}
                />
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}
