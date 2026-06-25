# 장윤정 AI 비서실 (Jang Yoonjeong AI Secretary)

의원실 통합 업무 관리 플랫폼. PRD 기반으로 **Next.js + TypeScript + TailwindCSS + Supabase + OpenAI** 스택으로 새로 구축합니다.

> 설계 제안서는 [`docs/`](./docs) 참고. 본 README는 MVP 1단계인 **AI 비서실장** 구현 기준입니다.

## 현재 구현 범위 (MVP 1단계)

✅ **AI 비서실장** — 자연어 요청을 6개 업무(민원·조직·일정·홍보·정책·뉴스)로 분류하고
`핵심요약 → 상황분석 → 추천행동 → 다음할일` 4단 포맷으로 응답.

- `app/secretary` — 채팅형 입력 UI + 4단 결과 카드
- `app/api/secretary/route.ts` — REST 엔드포인트 (입력 Zod 검증)
- `lib/openai/secretary.ts` — OpenAI structured output 으로 4단 포맷 강제
- `lib/secretary/log.ts` — Supabase `ai_requests` 로깅 (선택)

## 시작하기

```bash
npm install
cp .env.example .env.local   # OPENAI_API_KEY 입력
npm run dev                  # http://localhost:3000
```

- **필수**: `OPENAI_API_KEY` (없으면 친절한 503 오류 반환)
- **선택**: Supabase 환경변수 설정 시 요청 로그가 `ai_requests` 에 저장됨
  - 스키마: `supabase/migrations/0001_ai_requests.sql`

## 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | 린트 |

## 다음 단계 (로드맵)

2. 인증/권한 (Supabase Auth + 역할별 RLS)
3. 대시보드 (KPI + 오늘의 AI 브리핑)
4. CRM · 민원 · 일정 모듈 (MVP 완성)
5. 홍보/정책/뉴스 생성 → 선거캠프 확장 (PRD 49)

## 참고 (기존 자산)

루트의 `MOIDA *.html`, `index.html`, `admin.html` 등은 이전 Firebase 기반 프로토타입으로,
신규 플랫폼 구축의 **참고용**으로만 보존합니다.
