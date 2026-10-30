-- オリキャラ多元宇宙: 全員で同じ世界を見るための保存用テーブル
-- Supabase の SQL Editor に貼り付けて 1 回だけ実行してください
create table if not exists public.world_state (
  id text primary key,
  t double precision not null,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.world_state enable row level security;

-- 誰でも読める / 書けるのは id = 'main' の 1 行だけ (削除はできない)
drop policy if exists "world read" on public.world_state;
drop policy if exists "world insert" on public.world_state;
drop policy if exists "world update" on public.world_state;
create policy "world read" on public.world_state for select to anon, authenticated using (true);
create policy "world insert" on public.world_state for insert to anon, authenticated with check (id = 'main');
create policy "world update" on public.world_state for update to anon, authenticated using (id = 'main') with check (id = 'main');
