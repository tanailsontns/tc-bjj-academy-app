-- TC BJJ Academy App (Supabase) - SQL
-- Execute no Supabase: SQL Editor -> Run

-- Extensão para UUID
create extension if not exists "uuid-ossp";

-- Perfis
create table if not exists tc_profiles (
  user_id uuid primary key,
  role text default 'student', -- 'student' ou 'admin'
  full_name text,
  phone text,
  belt text,
  avatar_url text,
  created_at timestamp default now()
);

-- Horários (dias e horas)
create table if not exists tc_schedules (
  id uuid primary key default uuid_generate_v4(),
  day_of_week text not null,
  time text not null,
  class_name text not null,
  sort_key int default 0,
  created_at timestamp default now()
);

-- Presença confirmada
create table if not exists tc_attendance (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  schedule_id uuid not null references tc_schedules(id) on delete cascade,
  date date not null,
  present boolean default true,
  created_at timestamp default now(),
  unique(user_id, schedule_id, date)
);

-- Pagamentos
create table if not exists tc_payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  method text default 'pix',
  pix_key text,
  receipt_url text,
  status text default 'pending', -- pending/approved/rejected
  created_at timestamp default now()
);

-- Regras mínimas RLS (recomendado)
alter table tc_profiles enable row level security;
alter table tc_schedules enable row level security;
alter table tc_attendance enable row level security;
alter table tc_payments enable row level security;

-- Perfis: cada um vê/edita o próprio
drop policy if exists "profiles_select_own" on tc_profiles;
create policy "profiles_select_own" on tc_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on tc_profiles;
create policy "profiles_update_own" on tc_profiles for update
  using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on tc_profiles;
create policy "profiles_insert_own" on tc_profiles for insert
  with check (auth.uid() = user_id);

-- Horários: todos podem ver
drop policy if exists "schedules_select_all" on tc_schedules;
create policy "schedules_select_all" on tc_schedules for select using (true);

-- Horários: apenas admin pode inserir/deletar
drop policy if exists "schedules_admin_insert" on tc_schedules;
create policy "schedules_admin_insert" on tc_schedules for insert
  with check (exists (select 1 from tc_profiles p where p.user_id = auth.uid() and p.role = 'admin'));

drop policy if exists "schedules_admin_delete" on tc_schedules;
create policy "schedules_admin_delete" on tc_schedules for delete
  using (exists (select 1 from tc_profiles p where p.user_id = auth.uid() and p.role = 'admin'));

-- Presença: aluno pode inserir/ver sua própria presença
drop policy if exists "attendance_select_own" on tc_attendance;
create policy "attendance_select_own" on tc_attendance for select
  using (auth.uid() = user_id);

drop policy if exists "attendance_upsert_own" on tc_attendance;
create policy "attendance_upsert_own" on tc_attendance for insert
  with check (auth.uid() = user_id);

drop policy if exists "attendance_update_own" on tc_attendance;
create policy "attendance_update_own" on tc_attendance for update
  using (auth.uid() = user_id);

-- Pagamentos: aluno vê só os seus e cria os seus
drop policy if exists "payments_select_own" on tc_payments;
create policy "payments_select_own" on tc_payments for select
  using (auth.uid() = user_id);

drop policy if exists "payments_insert_own" on tc_payments;
create policy "payments_insert_own" on tc_payments for insert
  with check (auth.uid() = user_id);
