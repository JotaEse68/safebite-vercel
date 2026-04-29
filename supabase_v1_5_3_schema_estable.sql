-- SafeBite V1.5.3 - esquema mínimo estable
-- Idempotente. Ejecutar solo si se quiere dejar Supabase limpio para historial y guardado.

create extension if not exists "pgcrypto";

create table if not exists public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  status text,
  confidence text,
  explanation text,
  ingredients text,
  risks jsonb default '[]'::jsonb,
  hidden_allergens jsonb default '[]'::jsonb,
  input_type text,
  input_mode text,
  file_name text,
  product_name text,
  brand text,
  barcode text,
  image_url text,
  created_at timestamptz default now()
);

create table if not exists public.saved_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  product_name text,
  brand text,
  status text,
  decision text default 'pending',
  ingredients text,
  risks jsonb default '[]'::jsonb,
  hidden_allergens jsonb default '[]'::jsonb,
  barcode text,
  image_url text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.analysis_history
add column if not exists input_type text,
add column if not exists input_mode text,
add column if not exists file_name text,
add column if not exists product_name text,
add column if not exists brand text,
add column if not exists barcode text,
add column if not exists image_url text;

alter table public.saved_products
add column if not exists product_name text,
add column if not exists brand text,
add column if not exists status text,
add column if not exists decision text default 'pending',
add column if not exists ingredients text,
add column if not exists risks jsonb default '[]'::jsonb,
add column if not exists hidden_allergens jsonb default '[]'::jsonb,
add column if not exists barcode text,
add column if not exists image_url text,
add column if not exists notes text,
add column if not exists updated_at timestamptz default now();

alter table public.analysis_history enable row level security;
alter table public.saved_products enable row level security;

drop policy if exists "Users can read own analysis history" on public.analysis_history;
create policy "Users can read own analysis history"
on public.analysis_history for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own analysis history" on public.analysis_history;
create policy "Users can insert own analysis history"
on public.analysis_history for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can read own saved products" on public.saved_products;
create policy "Users can read own saved products"
on public.saved_products for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own saved products" on public.saved_products;
create policy "Users can insert own saved products"
on public.saved_products for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own saved products" on public.saved_products;
create policy "Users can update own saved products"
on public.saved_products for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own saved products" on public.saved_products;
create policy "Users can delete own saved products"
on public.saved_products for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists idx_analysis_history_user_child_created
on public.analysis_history(user_id, child_id, created_at desc);

create index if not exists idx_saved_products_user_child_created
on public.saved_products(user_id, child_id, created_at desc);

select pg_notify('pgrst', 'reload schema');
