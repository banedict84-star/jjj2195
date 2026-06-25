# 03. API 설계 (PRD 38)

- 방식: Next.js **Route Handlers** (`app/api/.../route.ts`), REST.
- 공통: 인증은 Supabase 세션, 입력은 Zod 검증, 응답은 `{ data }` / `{ error }`.
- 모든 도메인 공통으로 PRD 요구 6기능 제공: **조회·등록·수정·삭제·검색·통계**.

## 3.1 공통 응답 규약

```ts
// 성공
{ data: T, meta?: { page, pageSize, total } }
// 실패
{ error: { code: string, message: string } }
```

표준 쿼리 파라미터: `?q=검색어&status=&page=1&pageSize=20&sort=created_at.desc`

## 3.2 리소스 공통 CRUD 패턴

각 도메인(`people`, `minwon`, `events`, `pr`, `policy`, `news`)에 동일 적용:

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/{res}` | 목록 + 검색 + 페이징 |
| GET | `/api/{res}/{id}` | 단건 조회 |
| POST | `/api/{res}` | 등록 |
| PATCH | `/api/{res}/{id}` | 수정 |
| DELETE | `/api/{res}/{id}` | 삭제 |
| GET | `/api/{res}/stats` | 통계 |

## 3.3 AI 비서실장 (PRD 5)

```http
POST /api/secretary
```
```jsonc
// 요청
{ "input": "오늘 들어온 교통 민원 정리하고 처리방향 알려줘" }

// 응답
{
  "data": {
    "category": "민원",
    "summary": "오늘 교통 분야 민원 3건 접수.",
    "analysis": "2건은 신호체계, 1건은 불법주정차 관련...",
    "recommendation": "신호체계 2건은 도로교통과 이첩 권장...",
    "nextTodos": ["도로교통과 담당자 연락", "민원인 회신 문자 발송"],
    "links": [{ "label": "민원 #123", "href": "/minwon/123" }]
  }
}
```
처리: ① OpenAI 분류(function calling) → ② 카테고리별 Supabase 조회 → ③ 4단 포맷 생성(structured output) → ④ `ai_requests` 로깅.

## 3.4 홍보 생성 (PRD 19~23)

```http
POST /api/pr/generate
```
```jsonc
// 요청
{ "type": "보도자료", "topic": "청년 일자리 정책 간담회 개최",
  "tone": "공식", "keypoints": ["일시/장소", "주요 참석자", "기대효과"] }
// 응답
{ "data": { "title": "...", "body": "...(생성문)", "draftId": "uuid" } }
```
- `type` = 보도자료 / SNS / 문자 / 웹자보. 채널별 프롬프트 템플릿 분기(33).
- 문자: 90byte/LMS 길이 검증. 웹자보: 카피+이미지 문구 분리.
- 생성 결과는 `pr_contents`에 `status='초안'`으로 저장 → 검토 후 발행.

## 3.5 정책 지원 (PRD 24~27)

```http
POST /api/policy/generate   # type: 5분발언 | 도정질문 | 조례검토
```
- 입력 근거자료(`source`)를 함께 전달 → AI가 초안/검토의견 생성 → `policy_items` 저장.

## 3.6 뉴스 (PRD 28~31)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/news/collect` | 키워드 기반 수집(크롤/검색) 후 `news_items` 적재 |
| GET | `/api/news?sentiment=부정` | 모니터링 조회 |
| POST | `/api/news/report` | 아침/저녁 보고 생성(4단 포맷) → `news_reports` |

> 수집은 서버 크론(Vercel Cron) + 외부 검색/뉴스 API. 감성분석은 OpenAI.

## 3.7 횡단 API

| 경로 | 설명 |
|------|------|
| `POST /api/files` | Supabase Storage 업로드 + `files` 메타 저장 (39) |
| `GET /api/search?q=` | 통합 검색(인물/민원/일정/홍보) (40) |
| `GET /api/notifications` / `PATCH .../{id}/read` | 알림 (41) |
| `POST /api/integrations/sms` | 문자 발송 연동 (42) |
| `POST /api/integrations/calendar` | 캘린더 동기화 (43) |
| `GET /api/audit-logs` | 감사로그 조회(관리자) (44) |

## 3.8 OpenAI 연동 규약 (PRD 32, 33)

- 호출은 **서버 전용**(`lib/openai`). 키는 환경변수, 클라이언트 노출 금지.
- 공통 래퍼: 모델/온도/최대토큰/타임아웃/재시도 표준화 + `ai_requests`/토큰 기록.
- 프롬프트는 `lib/openai/prompts/`에 도메인별 분리 관리, 출력은 Zod로 강제 검증.
- 실패 시 폴백: 분류 실패 → `category=null` 처리 후 사용자에게 재질의.

## 3.9 인증·권한 (PRD 35, 45)

- 미들웨어에서 세션 검증 → 역할(role) 추출 → 라우트별 가드.
- 쓰기 API는 RLS(02 문서)와 미들웨어 이중 검증. 위반 시 `403`.
- 모든 변경(POST/PATCH/DELETE)은 `audit_logs` 자동 기록.
