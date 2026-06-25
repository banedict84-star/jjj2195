-- AI 비서실장 요청/응답 로그 (PRD 5, 44)
-- profiles 테이블이 아직 없을 수 있으므로 user_id 는 FK 없이 uuid 로 둔다.
create table if not exists ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  input text not null,
  category text check (category in ('민원','조직','일정','홍보','정책','뉴스')),
  summary text,
  analysis text,
  recommendation text,
  next_todos jsonb,
  model text,
  tokens int,
  created_at timestamptz default now()
);

create index if not exists ai_requests_created_at_idx on ai_requests (created_at desc);
create index if not exists ai_requests_category_idx on ai_requests (category);

alter table ai_requests enable row level security;

-- 서버(service-role)에서만 insert. 조회는 로그인 사용자 허용(필요 시 역할로 강화).
create policy if not exists ai_requests_select_authenticated
  on ai_requests for select
  to authenticated
  using (true);
