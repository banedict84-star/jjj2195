import type { DB } from "@/lib/store/types";

/**
 * 현재 저장된 데이터를 AI 가 읽을 수 있는 간결한 텍스트로 직렬화한다.
 * AI 비서실장 요청 시 함께 전달되어, AI 가 실제 데이터에 근거해 답하게 한다.
 */
export function buildContext(db: DB): string {
  const lines: string[] = [];

  if (db.people.length) {
    lines.push("[등록 인물]");
    db.people.forEach((p) =>
      lines.push(
        `- ${p.name} (${p.category}` +
          `${p.org ? `, ${p.org}` : ""}` +
          `${p.position ? ` ${p.position}` : ""}` +
          `${p.region ? `, ${p.region}` : ""}` +
          `${p.phone ? `, ${p.phone}` : ""})`
      )
    );
  }

  if (db.contacts.length) {
    lines.push("[연락 이력]");
    db.contacts.forEach((c) => {
      const name = db.people.find((x) => x.id === c.personId)?.name ?? "?";
      lines.push(
        `- ${name}: ${c.channel} - ${c.summary} (${c.contactedAt.slice(0, 10)})`
      );
    });
  }

  if (db.minwon.length) {
    lines.push("[민원]");
    db.minwon.forEach((m) =>
      lines.push(
        `- ${m.title} [${m.category}/${m.status}/${m.priority}] ` +
          `민원인:${m.personName || "-"} 담당:${m.assignee || "미배정"} 마감:${m.dueDate || "-"}`
      )
    );
  }

  if (db.events.length) {
    lines.push("[일정/행사]");
    db.events.forEach((e) =>
      lines.push(
        `- ${e.startAt.slice(0, 16).replace("T", " ")} ${e.title} ` +
          `(${e.type}, ${e.location}, ${e.status}, 참석 ${e.attendees.length}명` +
          `${e.attendees.length ? `: ${e.attendees.join(",")}` : ""})`
      )
    );
  }

  if (db.newsItems.length) {
    lines.push("[뉴스]");
    db.newsItems.forEach((n) =>
      lines.push(`- [${n.sentiment}] ${n.title} (${n.source})`)
    );
  }

  if (db.prContents.length) {
    lines.push("[홍보물]");
    db.prContents.forEach((p) =>
      lines.push(`- ${p.type}: ${p.title} (${p.status})`)
    );
  }

  if (db.policyItems.length) {
    lines.push("[정책문서]");
    db.policyItems.forEach((p) =>
      lines.push(`- ${p.type}: ${p.title} (${p.status})`)
    );
  }

  const text = lines.join("\n");
  // 프롬프트 비대화 방지: 과도하게 길면 자른다.
  return text.length > 8000 ? text.slice(0, 8000) + "\n…(이하 생략)" : text;
}
