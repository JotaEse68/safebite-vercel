-- SafeBite V1.5 - Código de barras + catálogo propio
-- Ejecutar sobre la base que ya tiene V1.4 aplicada.

create extension if not exists "pgcrypto";

-- 1) Catálogo propio de productos cacheados desde Open Food Facts
create table if not exists public.product_catalog (
  id uuid primary key default gen_random_uuid(),
  barcode text unique not null,
  product_name text,
  brand text,
  ingredients_text text,
  allergens_declared jsonb default '[]'::jsonb,
  traces_declared jsonb default '[]'::jsonb,
  image_url text,
  category text,
  quantity text,
  nutriscore text,
  source text default 'openfoodfacts',
  source_url text,
  source_confidence text default 'external',
  last_checked_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) Decisiones SafeBite por producto y perfil
create table if not exists public.product_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.product_catalog(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  analysis_id uuid references public.analysis_history(id) on delete set null,
  status text not null default 'PRECAUCION',
  confidence text,
  explanation text,
  risks jsonb default '[]'::jsonb,
  hidden_allergens jsonb default '[]'::jsonb,
  ingredients_found text,
  source text default 'safebite',
  created_at timestamptz default now()
);

-- 3) Ampliar historial y favoritos para barcode/catálogo
alter table public.analysis_history
  add column if not exists input_barcode text,
  add column if not exists catalog_product_id uuid references public.product_catalog(id) on delete set null;

alter table public.saved_products
  add column if not exists barcode text,
  add column if not exists brand text,
  add column if not exists catalog_product_id uuid references public.product_catalog(id) on delete set null;

-- Índices
create index if not exists idx_product_catalog_barcode on public.product_catalog(barcode);
create index if not exists idx_product_catalog_name on public.product_catalog(product_name);
create index if not exists idx_product_risk_product_child on public.product_risk_assessments(product_id, child_id, created_at desc);
create index if not exists idx_product_risk_user_child on public.product_risk_assessments(user_id, child_id, created_at desc);
create index if not exists idx_analysis_history_barcode on public.analysis_history(input_barcode);
create index if not exists idx_saved_products_barcode on public.saved_products(barcode);

-- updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_product_catalog_updated_at on public.product_catalog;
create trigger set_product_catalog_updated_at
before update on public.product_catalog
for each row execute function public.set_updated_at();

-- RLS
alter table public.product_catalog enable row level security;
alter table public.product_risk_assessments enable row level security;

-- product_catalog: catálogo compartido, cacheado por usuarios autenticados
drop policy if exists "Authenticated users can read product catalog" on public.product_catalog;
create policy "Authenticated users can read product catalog"
on public.product_catalog for select
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert product catalog" on public.product_catalog;
create policy "Authenticated users can insert product catalog"
on public.product_catalog for insert
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update product catalog" on public.product_catalog;
create policy "Authenticated users can update product catalog"
on public.product_catalog for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- product_risk_assessments: cada usuario ve sus decisiones
drop policy if exists "Users can read own product assessments" on public.product_risk_assessments;
create policy "Users can read own product assessments"
on public.product_risk_assessments for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own product assessments" on public.product_risk_assessments;
create policy "Users can insert own product assessments"
on public.product_risk_assessments for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own product assessments" on public.product_risk_assessments;
create policy "Users can delete own product assessments"
on public.product_risk_assessments for delete
using (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
