import type { DB } from "@/lib/store/types";
import type { Category, SecretaryResult } from "@/lib/validators/secretary";

const KEYWORDS: Record<Category, string[]> = {
  민원: ["민원", "교통", "복지", "환경", "안전", "신호", "주차"],
  일정: ["일정", "행사", "간담회", "회의", "스케줄", "참석"],
  홍보: ["홍보", "보도", "보도자료", "sns", "문자", "웹자보", "카드뉴스"],
  정책: ["정책", "발언", "5분", "도정질문", "조례", "법안"],
  뉴스: ["뉴스", "언론", "기사", "모니터링", "여론"],
  조직: ["인물", "연락", "crm", "조직", "주민", "당원"],
};

function classify(input: string): Category {
  const t = input.toLowerCase();
  let best: Category = "민원";
  let bestScore = -1;
  (Object.keys(KEYWORDS) as Category[]).forEach((cat) => {
    const score = KEYWORDS[cat].filter((k) => t.includes(k.toLowerCase())).length;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  });
  return best;
}

/**
 * OpenAI 가 불가할 때 로컬 데이터로 4단 분석을 생성하는 폴백.
 * 실제 저장된 데이터(민원/일정/뉴스 등)를 집계해 답한다.
 */
export function localAnalyze(input: string, db: DB): SecretaryResult {
  const category = classify(input);

  if (category === "민원") {
    const open = db.minwon.filter((m) => m.status !== "완료");
    const urgent = open.filter((m) => m.priority === "긴급" || m.priority === "높음");
    return {
      category,
      summary: `미처리 민원 ${open.length}건 중 긴급·높음이 ${urgent.length}건입니다.`,
      analysis:
        open.length === 0
          ? "현재 처리 대기 중인 민원이 없습니다."
          : "대기 민원: " +
            open.map((m) => `${m.title}(${m.status}/${m.priority})`).join(", "),
      recommendation: urgent.length
        ? `우선순위가 높은 ${urgent.length}건을 먼저 담당자에게 배정하고 처리 일정을 잡으세요.`
        : "현 수준 유지하되 마감 임박 건을 점검하세요.",
      nextTodos: [
        ...urgent.slice(0, 3).map((m) => `[긴급] ${m.title} 담당 배정/연락`),
        "미배정 민원 담당자 지정",
      ],
    };
  }

  if (category === "일정") {
    const upcoming = db.events
      .filter((e) => e.status === "예정" || e.status === "진행")
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    return {
      category,
      summary: `예정된 일정 ${upcoming.length}건이 있습니다.`,
      analysis: upcoming.length
        ? upcoming
            .map(
              (e) =>
                `${new Date(e.startAt).toLocaleString("ko-KR", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })} ${e.title}(${e.location}, 참석 ${e.attendees.length}명)`
            )
            .join(" / ")
        : "예정된 일정이 없습니다.",
      recommendation:
        "가장 임박한 일정의 자료·참석자 확정 여부를 점검하고, 종료된 일정은 결과보고를 작성하세요.",
      nextTodos: upcoming.slice(0, 3).map((e) => `${e.title} 준비사항 점검`),
    };
  }

  if (category === "뉴스") {
    const neg = db.newsItems.filter((n) => n.sentiment === "부정");
    return {
      category,
      summary: `최근 뉴스 ${db.newsItems.length}건 중 부정 보도가 ${neg.length}건입니다.`,
      analysis: neg.length
        ? "부정 보도: " + neg.map((n) => `${n.title}(${n.source})`).join(", ")
        : "부정 보도는 없습니다.",
      recommendation: neg.length
        ? "부정 보도의 사실관계를 확인하고 필요 시 입장자료를 준비하세요."
        : "현 모니터링 수준을 유지하고 긍정 보도는 SNS 확산을 검토하세요.",
      nextTodos: neg.length
        ? neg.slice(0, 3).map((n) => `'${n.title}' 사실관계 확인`)
        : ["주요 키워드 모니터링 유지"],
    };
  }

  if (category === "홍보") {
    const drafts = db.prContents.filter((p) => p.status !== "발행");
    return {
      category,
      summary: `발행 대기 홍보물이 ${drafts.length}건 있습니다.`,
      analysis: drafts.length
        ? "대기: " + drafts.map((p) => `${p.type}-${p.title}`).join(", ")
        : "대기 중인 홍보물이 없습니다. 홍보실에서 새 콘텐츠를 생성할 수 있습니다.",
      recommendation:
        "검토 단계 홍보물을 확인해 발행하고, 임박 행사는 웹자보·보도자료를 미리 준비하세요.",
      nextTodos: [
        "검토 대기 홍보물 승인/수정",
        "다가오는 행사용 웹자보 제작",
      ],
    };
  }

  if (category === "정책") {
    const items = db.policyItems.filter((p) => p.status !== "완료");
    return {
      category,
      summary: `작성·검토 중인 정책 문서가 ${items.length}건입니다.`,
      analysis: items.length
        ? items.map((p) => `${p.type}-${p.title}(${p.status})`).join(", ")
        : "진행 중인 정책 문서가 없습니다.",
      recommendation:
        "검토 단계 문서를 마무리하고, 최근 민원·뉴스 이슈를 5분발언/도정질문 주제로 검토하세요.",
      nextTodos: items.slice(0, 3).map((p) => `${p.title} 마무리`),
    };
  }

  // 조직(CRM)
  const recent = db.contacts
    .slice()
    .sort((a, b) => b.contactedAt.localeCompare(a.contactedAt));
  return {
    category,
    summary: `등록 인물 ${db.people.length}명, 연락 이력 ${db.contacts.length}건입니다.`,
    analysis: recent.length
      ? "최근 연락: " +
        recent
          .slice(0, 3)
          .map((c) => {
            const p = db.people.find((x) => x.id === c.personId);
            return `${p?.name ?? "?"}(${c.channel})`;
          })
          .join(", ")
      : "최근 연락 이력이 없습니다.",
    recommendation:
      "중요도 높은 인물 중 최근 연락이 뜸한 대상을 점검하고 정기 연락 일정을 잡으세요.",
    nextTodos: ["중요 인물 연락 주기 점검", "신규 인물 등록"],
  };
}
