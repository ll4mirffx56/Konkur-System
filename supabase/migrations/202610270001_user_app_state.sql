-- Stores the existing Moroor app state as one versioned document per signed-in user.
-- Safe to run after the initial tables have been created.
create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_app_state enable row level security;

-- Drop only this policy name to make this migration repeatable.
drop policy if exists "Users manage own app state" on public.user_app_state;
create policy "Users manage own app state"
on public.user_app_state
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update, delete on public.user_app_state to authenticated;
