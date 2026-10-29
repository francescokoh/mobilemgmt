-- Supabase SQL Editor에서 실행. 허용 계정 이메일은 아래 함수에서 한 곳만 관리한다.

create or replace function public.is_owner() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'francescokoh@gmail.com'
$$;

create table if not exists public.games (
  id            text primary key,
  name          text not null,
  sort_order    int  not null,
  timezone      text not null default 'Asia/Seoul',
  reset_hour    int  not null default 5 check (reset_hour between 0 and 23),
  week_starts_on int not null default 1 check (week_starts_on between 0 and 6), -- 0=일 … 6=토
  source_url    text,
  checked_at    date,
  active        boolean not null default true
);

create table if not exists public.tasks (
  game_id       text not null references public.games(id) on delete cascade,
  id            text not null,
  name          text not null,
  kind          text not null check (kind in ('check', 'count')),
  target        int  not null default 1 check (target >= 1),
  cycle_type    text not null check (cycle_type in ('daily', 'weekly', 'monthly', 'everyNDays')),
  cycle_days    int  check (cycle_days >= 1),
  cycle_anchor  date,
  ends_at       date,                       -- 기간 한정 이벤트 종료일(해당 날짜 포함)
  sort_order    int  not null default 0,
  active        boolean not null default true,  -- 삭제 대신 비활성(이력 보존)
  primary key (game_id, id),
  check (cycle_type <> 'everyNDays' or (cycle_days is not null and cycle_anchor is not null))
);

-- 현재 상태와 이력을 겸한다: 주기 키별로 한 행이 남고, 지난 주기 행은 그대로 보존된다.
create table if not exists public.progress (
  game_id     text not null,
  task_id     text not null,
  period_key  text not null,
  count       int  not null default 0 check (count >= 0),
  done_at     timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (game_id, task_id, period_key),
  foreign key (game_id, task_id) references public.tasks(game_id, id) on delete cascade
);

alter table public.games    enable row level security;
alter table public.tasks    enable row level security;
alter table public.progress enable row level security;

-- games/tasks: 읽기만 허용(쓰기는 service_role 동기화 스크립트가 RLS를 우회해 수행)
drop policy if exists games_read on public.games;
create policy games_read on public.games for select using (public.is_owner());
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select using (public.is_owner());

drop policy if exists progress_all on public.progress;
create policy progress_all on public.progress for all
  using (public.is_owner()) with check (public.is_owner());
