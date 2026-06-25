import type { SecretaryResult } from "@/lib/validators/secretary";

const CATEGORY_STYLE: Record<string, string> = {
  민원: "bg-rose-100 text-rose-700",
  조직: "bg-amber-100 text-amber-700",
  일정: "bg-sky-100 text-sky-700",
  홍보: "bg-violet-100 text-violet-700",
  정책: "bg-emerald-100 text-emerald-700",
  뉴스: "bg-slate-200 text-slate-700",
};

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-slate-100 px-5 py-4 first:border-t-0">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand">
        {label}
      </h3>
      <div className="text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

export default function ResultCard({ result }: { result: SecretaryResult }) {
  const badge = CATEGORY_STYLE[result.category] ?? "bg-slate-200 text-slate-700";

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 bg-slate-50 px-5 py-3">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge}`}
        >
          {result.category}
        </span>
        <span className="text-xs text-slate-400">AI 비서실장 분류</span>
      </div>

      <Section label="핵심요약">{result.summary}</Section>
      <Section label="상황분석">{result.analysis}</Section>
      <Section label="추천행동">{result.recommendation}</Section>
      <Section label="다음 할 일">
        {result.nextTodos.length === 0 ? (
          <span className="text-slate-400">—</span>
        ) : (
          <ul className="space-y-1.5">
            {result.nextTodos.map((todo, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300 text-[10px] text-slate-400">
                  {i + 1}
                </span>
                <span>{todo}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
