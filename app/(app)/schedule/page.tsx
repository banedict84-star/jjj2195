"use client";

import { useMemo, useState } from "react";
import { useCollection } from "@/lib/store/useDB";
import { insert, update, remove, newId, nowISO } from "@/lib/store/db";
import type { EventItem, EventStatus } from "@/lib/store/types";
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

const TYPES = ["행사", "회의", "의정활동", "지역일정"];
const STATUSES: EventStatus[] = ["예정", "진행", "완료", "취소"];
const STATUS_TONE: Record<EventStatus, string> = {
  예정: "blue",
  진행: "amber",
  완료: "green",
  취소: "slate",
};

const empty = (): EventItem => ({
  id: "",
  title: "",
  type: "행사",
  location: "",
  startAt: "",
  description: "",
  status: "예정",
  attendees: [],
  report: "",
  createdAt: "",
});

// datetime-local <-> ISO 변환
const toLocal = (iso: string) =>
  iso ? new Date(iso).toISOString().slice(0, 16) : "";
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : "");

export default function SchedulePage() {
  const events = useCollection("events");
  const [edit, setEdit] = useState<EventItem | null>(null);
  const [report, setReport] = useState<EventItem | null>(null);

  const sorted = useMemo(
    () => events.slice().sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [events]
  );

  function save() {
    if (!edit || !edit.title.trim()) return;
    if (edit.id) update("events", edit.id, edit);
    else insert("events", { ...edit, id: newId(), createdAt: nowISO() });
    setEdit(null);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title="일정 · 행사"
        desc="일정을 등록하고 참석자 관리와 결과보고를 작성합니다."
        action={
          <PrimaryButton onClick={() => setEdit(empty())}>
            + 일정 등록
          </PrimaryButton>
        }
      />

      {sorted.length === 0 ? (
        <EmptyState text="등록된 일정이 없습니다." />
      ) : (
        <div className="space-y-3">
          {sorted.map((e) => {
            const d = e.startAt ? new Date(e.startAt) : null;
            return (
              <div
                key={e.id}
                className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="w-16 shrink-0 text-center">
                  <p className="text-xs text-slate-400">
                    {d ? `${d.getMonth() + 1}월` : ""}
                  </p>
                  <p className="text-2xl font-bold">{d ? d.getDate() : "-"}</p>
                  <p className="text-xs text-slate-400">
                    {d
                      ? d.toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>
                    <Badge>{e.type}</Badge>
                    <span className="font-semibold">{e.title}</span>
                  </div>
                  <p className="text-sm text-slate-600">
                    📍 {e.location || "-"} {e.description && `· ${e.description}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    참석자 {e.attendees.length}명
                    {e.attendees.length > 0 && `: ${e.attendees.join(", ")}`}
                  </p>
                  {e.report && (
                    <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                      📋 {e.report}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs">
                  <button
                    onClick={() => setReport(e)}
                    className="mr-2 text-brand hover:underline"
                  >
                    결과보고
                  </button>
                  <button
                    onClick={() => setEdit(e)}
                    className="mr-2 text-slate-500 hover:underline"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => remove("events", e.id)}
                    className="text-rose-500 hover:underline"
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 등록/수정 */}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "일정 수정" : "일정 등록"}
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="유형">
                <select
                  className={inputCls}
                  value={edit.type}
                  onChange={(e) => setEdit({ ...edit, type: e.target.value })}
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
                    setEdit({ ...edit, status: e.target.value as EventStatus })
                  }
                >
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="일시">
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={toLocal(edit.startAt)}
                  onChange={(e) =>
                    setEdit({ ...edit, startAt: fromLocal(e.target.value) })
                  }
                />
              </Field>
              <Field label="장소">
                <input
                  className={inputCls}
                  value={edit.location}
                  onChange={(e) =>
                    setEdit({ ...edit, location: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="설명">
              <input
                className={inputCls}
                value={edit.description}
                onChange={(e) =>
                  setEdit({ ...edit, description: e.target.value })
                }
              />
            </Field>
            <Field label="참석자 (쉼표로 구분)">
              <input
                className={inputCls}
                value={edit.attendees.join(", ")}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    attendees: e.target.value
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

      {/* 결과보고 */}
      <Modal
        open={!!report}
        onClose={() => setReport(null)}
        title={`결과보고 · ${report?.title ?? ""}`}
        footer={
          <>
            <GhostButton onClick={() => setReport(null)}>닫기</GhostButton>
            <PrimaryButton
              onClick={() => {
                if (report)
                  update("events", report.id, {
                    report: report.report,
                    status: "완료",
                  });
                setReport(null);
              }}
            >
              저장 (완료 처리)
            </PrimaryButton>
          </>
        }
      >
        {report && (
          <Field label="결과 요약">
            <textarea
              className={inputCls}
              rows={5}
              placeholder="참석 인원, 주요 논의, 후속 조치 등을 기록하세요."
              value={report.report}
              onChange={(e) =>
                setReport({ ...report, report: e.target.value })
              }
            />
          </Field>
        )}
      </Modal>
    </main>
  );
}
