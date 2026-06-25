"use client";

import { useMemo, useState } from "react";
import { useCollection } from "@/lib/store/useDB";
import { insert, update, remove, newId, nowISO } from "@/lib/store/db";
import type { ContactLog, Person } from "@/lib/store/types";
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

const CATEGORIES = ["지역주민", "유관기관", "언론", "당원", "공무원", "기타"];
const emptyPerson = (): Person => ({
  id: "",
  name: "",
  category: "지역주민",
  org: "",
  position: "",
  region: "",
  phone: "",
  email: "",
  importance: 1,
  memo: "",
  createdAt: "",
});

export default function CrmPage() {
  const people = useCollection("people");
  const contacts = useCollection("contacts");

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<Person | null>(null);
  const [detail, setDetail] = useState<Person | null>(null);

  const filtered = useMemo(() => {
    const kw = q.trim();
    return people.filter(
      (p) =>
        (!cat || p.category === cat) &&
        (!kw ||
          [p.name, p.org, p.region, p.position, p.memo].some((f) =>
            f.includes(kw)
          ))
    );
  }, [people, q, cat]);

  function save() {
    if (!edit || !edit.name.trim()) return;
    if (edit.id) {
      update("people", edit.id, edit);
    } else {
      insert("people", { ...edit, id: newId(), createdAt: nowISO() });
    }
    setEdit(null);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title="CRM · 인물 관리"
        desc="지역 인물·유관기관을 등록하고 연락 이력을 관리합니다."
        action={
          <PrimaryButton onClick={() => setEdit(emptyPerson())}>
            + 인물 등록
          </PrimaryButton>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름·소속·지역 검색"
          className="w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
        >
          <option value="">전체 분류</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span className="self-center text-xs text-slate-400">
          {filtered.length}명
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="등록된 인물이 없습니다." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5">이름</th>
                <th className="px-4 py-2.5">분류</th>
                <th className="px-4 py-2.5">소속/직책</th>
                <th className="px-4 py-2.5">지역</th>
                <th className="px-4 py-2.5">연락처</th>
                <th className="px-4 py-2.5">중요도</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone="blue">{p.category}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {p.org} {p.position && `· ${p.position}`}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{p.region}</td>
                  <td className="px-4 py-2.5 text-slate-600">{p.phone}</td>
                  <td className="px-4 py-2.5">{"★".repeat(p.importance)}</td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    <button
                      onClick={() => setDetail(p)}
                      className="mr-2 text-brand hover:underline"
                    >
                      이력
                    </button>
                    <button
                      onClick={() => setEdit(p)}
                      className="mr-2 text-slate-500 hover:underline"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => remove("people", p.id)}
                      className="text-rose-500 hover:underline"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 등록/수정 */}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "인물 수정" : "인물 등록"}
        footer={
          <>
            <GhostButton onClick={() => setEdit(null)}>취소</GhostButton>
            <PrimaryButton onClick={save}>저장</PrimaryButton>
          </>
        }
      >
        {edit && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="이름">
              <input
                className={inputCls}
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field label="분류">
              <select
                className={inputCls}
                value={edit.category}
                onChange={(e) => setEdit({ ...edit, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="소속">
              <input
                className={inputCls}
                value={edit.org}
                onChange={(e) => setEdit({ ...edit, org: e.target.value })}
              />
            </Field>
            <Field label="직책">
              <input
                className={inputCls}
                value={edit.position}
                onChange={(e) => setEdit({ ...edit, position: e.target.value })}
              />
            </Field>
            <Field label="지역">
              <input
                className={inputCls}
                value={edit.region}
                onChange={(e) => setEdit({ ...edit, region: e.target.value })}
              />
            </Field>
            <Field label="연락처">
              <input
                className={inputCls}
                value={edit.phone}
                onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
              />
            </Field>
            <Field label="이메일">
              <input
                className={inputCls}
                value={edit.email}
                onChange={(e) => setEdit({ ...edit, email: e.target.value })}
              />
            </Field>
            <Field label="중요도 (0~3)">
              <select
                className={inputCls}
                value={edit.importance}
                onChange={(e) =>
                  setEdit({ ...edit, importance: Number(e.target.value) })
                }
              >
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <div className="col-span-2">
              <Field label="메모">
                <textarea
                  className={inputCls}
                  rows={2}
                  value={edit.memo}
                  onChange={(e) => setEdit({ ...edit, memo: e.target.value })}
                />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      {/* 연락 이력 */}
      {detail && (
        <ContactModal
          person={detail}
          logs={contacts.filter((c) => c.personId === detail.id)}
          onClose={() => setDetail(null)}
        />
      )}
    </main>
  );
}

function ContactModal({
  person,
  logs,
  onClose,
}: {
  person: Person;
  logs: ContactLog[];
  onClose: () => void;
}) {
  const [channel, setChannel] = useState("전화");
  const [summary, setSummary] = useState("");

  function add() {
    if (!summary.trim()) return;
    insert("contacts", {
      id: newId(),
      personId: person.id,
      channel,
      summary,
      contactedAt: nowISO(),
    });
    setSummary("");
  }

  return (
    <Modal open onClose={onClose} title={`${person.name} · 연락 이력`}>
      <div className="mb-4 flex gap-2">
        <select
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
        >
          {["전화", "문자", "대면", "이메일"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input
          className={inputCls}
          placeholder="연락 내용 요약"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <PrimaryButton onClick={add}>기록</PrimaryButton>
      </div>
      {logs.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          연락 이력이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {logs
            .slice()
            .sort((a, b) => b.contactedAt.localeCompare(a.contactedAt))
            .map((l) => (
              <li
                key={l.id}
                className="flex items-start gap-3 rounded-lg border border-slate-100 p-3 text-sm"
              >
                <Badge tone="violet">{l.channel}</Badge>
                <div className="flex-1">
                  <p>{l.summary}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {new Date(l.contactedAt).toLocaleString("ko-KR")}
                  </p>
                </div>
                <button
                  onClick={() => remove("contacts", l.id)}
                  className="text-xs text-rose-400 hover:underline"
                >
                  삭제
                </button>
              </li>
            ))}
        </ul>
      )}
    </Modal>
  );
}
