-- SafeBite V1.5.2 - Hotfix historial, columnas de análisis y guardado estable
create extension if not exists "pgcrypto";
create table if not exists public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  created_at timestamptz default now()
);
alter table public.analysis_history add column if not exists child_name text;
alter table public.analysis_history add column if not exists input_type text;
alter table public.analysis_history add column if not exists input_name text;
alter table public.analysis_history add column if not exists input_mode text;
alter table public.analysis_history add column if not exists status text default 'PRECAUCION';
alter table public.analysis_history add column if not exists confidence text;
alter table public.analysis_history add column if not exists explanation text;
alter table public.analysis_history add column if not exists risks jsonb default '[]'::jsonb;
alter table public.analysis_history add column if not exists hidden_allergens jsonb default '[]'::jsonb;
alter table public.analysis_history add column if not exists ingredients_found text;
alter table public.analysis_history add column if not exists evidence jsonb default '[]'::jsonb;
alter table public.analysis_history add column if not exists expert_documents_used jsonb default '[]'::jsonb;
alter table public.analysis_history add column if not exists input_preview jsonb default '{}'::jsonb;
alter table public.analysis_history add column if not exists input_barcode text;
alter table public.analysis_history add column if not exists barcode text;
alter table public.analysis_history add column if not exists product_name text;
alter table public.analysis_history add column if not exists brand text;
alter table public.analysis_history add column if not exists image_url text;
alter table public.analysis_history add column if not exists catalog_product_id uuid references public.product_catalog(id) on delete set null;
alter table public.analysis_history add column if not exists source text default 'safebite';
create index if not exists idx_analysis_history_user_child_date on public.analysis_history(user_id, child_id, created_at desc);
create index if not exists idx_analysis_history_status on public.analysis_history(status);
create index if not exists idx_analysis_history_barcode on public.analysis_history(input_barcode);
alter table public.analysis_history enable row level security;
drop policy if exists "Users can read own analysis history" on public.analysis_history;
create policy "Users can read own analysis history" on public.analysis_history for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert own analysis history" on public.analysis_history;
create policy "Users can insert own analysis history" on public.analysis_history for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can delete own analysis history" on public.analysis_history;
create policy "Users can delete own analysis history" on public.analysis_history for delete to authenticated using (auth.uid() = user_id);
alter table public.saved_products add column if not exists kind text;
alter table public.saved_products add column if not exists decision text default 'pending';
alter table public.saved_products add column if not exists product_name text;
alter table public.saved_products add column if not exists status text;
alter table public.saved_products add column if not exists ingredients text;
alter table public.saved_products add column if not exists risks jsonb default '[]'::jsonb;
alter table public.saved_products add column if not exists hidden_allergens jsonb default '[]'::jsonb;
alter table public.saved_products add column if not exists notes text;
alter table public.saved_products add column if not exists barcode text;
alter table public.saved_products add column if not exists image_url text;
alter table public.saved_products add column if not exists brand text;
select pg_notify('pgrst', 'reload schema');
