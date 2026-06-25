"use client";

import { useDB } from "@/lib/store/useDB";
import { resetDB } from "@/lib/store/db";
import { ROLES, NAV_ITEMS } from "@/lib/roles";
import { PageHeader, Badge } from "@/components/ui/primitives";

export default function AdminPage() {
  const db = useDB();

  const counts: { label: string; n: number }[] = [
    { label: "인물", n: db.people.length },
    { label: "연락이력", n: db.contacts.length },
    { label: "민원", n: db.minwon.length },
    { label: "일정", n: db.events.length },
    { label: "홍보물", n: db.prContents.length },
    { label: "정책문서", n: db.policyItems.length },
    { label: "뉴스", n: db.newsItems.length },
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader title="관리" desc="역할·권한 안내와 데이터 현황을 확인합니다." />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          데이터 현황
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {counts.map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-slate-200 bg-white p-3 text-center"
            >
              <p className="text-xs text-slate-500">{c.label}</p>
              <p className="text-2xl font-bold">{c.n}</p>
            </div>
          ))}
        </div>
        <button
          onClick={() => {
            if (confirm("모든 데이터를 초기 샘플로 되돌립니다. 계속할까요?"))
              resetDB();
          }}
          className="mt-3 rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
        >
          데이터 초기화 (샘플로 복원)
        </button>
        <p className="mt-1 text-xs text-slate-400">
          데이터는 브라우저(localStorage)에 저장됩니다. 추후 Supabase 연동 시
          서버 DB로 대체됩니다.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          역할별 메뉴 권한 (PRD 4장)
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5">역할</th>
                <th className="px-4 py-2.5">접근 가능 메뉴</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((role) => (
                <tr key={role} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium">{role}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {NAV_ITEMS.filter(
                        (i) => i.roles === "all" || i.roles.includes(role)
                      ).map((i) => (
                        <Badge key={i.href}>{i.label}</Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
