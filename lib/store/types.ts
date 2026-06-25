/** 로컬 데이터 계층 엔티티 타입 (PRD 8 데이터모델 기반) */

export interface Person {
  id: string;
  name: string;
  category: string; // 지역주민/유관기관/언론/당원/공무원 등
  org: string;
  position: string;
  region: string;
  phone: string;
  email: string;
  importance: number; // 0~3
  memo: string;
  createdAt: string;
}

export interface ContactLog {
  id: string;
  personId: string;
  channel: string; // 전화/문자/대면/이메일
  summary: string;
  contactedAt: string;
}

export type MinwonStatus = "접수" | "처리중" | "완료" | "보류";
export type Priority = "긴급" | "높음" | "보통" | "낮음";

export interface Minwon {
  id: string;
  title: string;
  content: string;
  personName: string; // 민원인
  category: string; // 교통/복지/환경/안전/기타
  status: MinwonStatus;
  priority: Priority;
  assignee: string;
  dueDate: string;
  createdAt: string;
}

export type EventStatus = "예정" | "진행" | "완료" | "취소";

export interface EventItem {
  id: string;
  title: string;
  type: string; // 행사/회의/의정활동/지역일정
  location: string;
  startAt: string; // ISO
  description: string;
  status: EventStatus;
  attendees: string[]; // 참석자 이름
  report: string; // 결과보고 (완료 후 작성)
  createdAt: string;
}

export type PrType = "보도자료" | "SNS" | "문자" | "웹자보";
export type PrStatus = "초안" | "검토" | "발행";

export interface PrContent {
  id: string;
  type: PrType;
  title: string;
  body: string;
  status: PrStatus;
  createdAt: string;
}

export type PolicyType = "5분발언" | "도정질문" | "조례검토";
export type PolicyStatus = "작성중" | "검토" | "완료";

export interface PolicyItem {
  id: string;
  type: PolicyType;
  title: string;
  content: string;
  source: string;
  status: PolicyStatus;
  createdAt: string;
}

export type Sentiment = "긍정" | "중립" | "부정";

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  sentiment: Sentiment;
  keywords: string[];
  summary: string;
  publishedAt: string;
  createdAt: string;
}

export interface DB {
  people: Person[];
  contacts: ContactLog[];
  minwon: Minwon[];
  events: EventItem[];
  prContents: PrContent[];
  policyItems: PolicyItem[];
  newsItems: NewsItem[];
}

export type CollectionKey = keyof DB;
