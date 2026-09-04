-- ============================================================
--  BATTERD schema — expenses + purchase tracker
--  Run once on the Battered Supabase project.
-- ============================================================

-- ---------- Expenses (money paid personally by a partner) ----------
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  partner      text not null,
  amount       numeric not null,
  category     text not null,
  expense_date date not null,
  description  text,
  note         text,
  reimbursed   boolean not null default false,
  photo_url    text,
  photo_path   text,
  created_at   timestamptz not null default now()
);

-- ---------- Purchase tracker (orders moving through a pipeline) ----------
create table if not exists public.purchases (
  id            uuid primary key default gen_random_uuid(),
  category      text not null,
  item          text not null,
  supplier      text,
  quantity      numeric,
  unit_cost     numeric,
  status        text not null default 'researching',
  order_date    date,
  delivery_date date,
  note          text,
  created_at    timestamptz not null default now()
);

-- ---------- Row Level Security (open access — matches the shared, link-based app) ----------
alter table public.expenses  enable row level security;
alter table public.purchases enable row level security;

drop policy if exists "expenses_all" on public.expenses;
create policy "expenses_all" on public.expenses
  for all using (true) with check (true);

drop policy if exists "purchases_all" on public.purchases;
create policy "purchases_all" on public.purchases
  for all using (true) with check (true);

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.purchases;

-- ---------- Storage bucket for receipt photos ----------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do update set public = true;

drop policy if exists "receipts_read"   on storage.objects;
drop policy if exists "receipts_insert" on storage.objects;
drop policy if exists "receipts_delete" on storage.objects;
create policy "receipts_read"   on storage.objects for select using (bucket_id = 'receipts');
create policy "receipts_insert" on storage.objects for insert with check (bucket_id = 'receipts');
create policy "receipts_delete" on storage.objects for delete using (bucket_id = 'receipts');
