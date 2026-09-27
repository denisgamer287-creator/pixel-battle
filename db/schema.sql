-- SQL для Supabase
-- Створіть таблицю pixel_map

create table if not exists public.pixel_map (
  x integer not null,
  y integer not null,
  color text not null,
  updated_at timestamptz default now(),
  primary key (x, y)
);

-- Дозволити анонімному доступу для читання/запису у демо-режимі
alter table public.pixel_map enable row level security;

create policy "Allow anonymous read access"
  on public.pixel_map
  for select
  using (true);

create policy "Allow anonymous insert or update"
  on public.pixel_map
  for insert
  with check (true);

create policy "Allow anonymous update"
  on public.pixel_map
  for update
  using (true)
  with check (true);
