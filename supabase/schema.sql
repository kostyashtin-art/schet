create extension if not exists pgcrypto;
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  type text not null check (type in ('income','expense')),
  amount numeric(14,2) not null check (amount > 0),
  category text not null,
  comment text not null default '',
  source_sheet text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on public.transactions(user_id, date desc);
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income','expense')),
  created_at timestamptz not null default now(),
  unique(user_id, name, type)
);
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\\d{4}-\\d{2}$'),
  category text not null,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique(user_id, month, category)
);
alter table public.transactions enable row level security;
alter table public.categories enable row level security;
alter table public.budgets enable row level security;
drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions for select using (auth.uid() = user_id);
drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions for insert with check (auth.uid() = user_id);
drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions for delete using (auth.uid() = user_id);
drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own" on public.categories for select using (auth.uid() = user_id);
drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own" on public.categories for insert with check (auth.uid() = user_id);
drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own" on public.categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own" on public.categories for delete using (auth.uid() = user_id);
drop policy if exists "budgets_select_own" on public.budgets;
create policy "budgets_select_own" on public.budgets for select using (auth.uid() = user_id);
drop policy if exists "budgets_insert_own" on public.budgets;
create policy "budgets_insert_own" on public.budgets for insert with check (auth.uid() = user_id);
drop policy if exists "budgets_update_own" on public.budgets;
create policy "budgets_update_own" on public.budgets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "budgets_delete_own" on public.budgets;
create policy "budgets_delete_own" on public.budgets for delete using (auth.uid() = user_id);
