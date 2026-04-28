-- SafeBite V1.4 - Memoria real, historial avanzado, favoritos y alternativas admin

create extension if not exists "pgcrypto";

-- 1) Historial avanzado de análisis
create table if not exists public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  child_name text,
  input_type text,
  input_name text,
  status text not null default 'PRECAUCION',
  confidence text,
  explanation text,
  risks jsonb default '[]'::jsonb,
  hidden_allergens jsonb default '[]'::jsonb,
  ingredients_found text,
  evidence jsonb default '[]'::jsonb,
  expert_documents_used jsonb default '[]'::jsonb,
  input_preview jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 2) Productos guardados por perfil
create table if not exists public.saved_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  analysis_id uuid references public.analysis_history(id) on delete set null,
  kind text not null default 'pending', -- safe / avoid / pending
  product_name text not null,
  status text,
  confidence text,
  explanation text,
  ingredients_found text,
  risks jsonb default '[]'::jsonb,
  hidden_allergens jsonb default '[]'::jsonb,
  input_type text,
  input_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3) Alternativas manuales gestionadas desde admin
create table if not exists public.product_alternatives (
  id uuid primary key default gen_random_uuid(),
  allergen text default 'general',
  category text default 'general',
  trigger_text text,
  suggestion text not null,
  status text default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Índices
create index if not exists idx_analysis_history_user_child_date on public.analysis_history(user_id, child_id, created_at desc);
create index if not exists idx_analysis_history_status on public.analysis_history(status);
create index if not exists idx_saved_products_user_child_date on public.saved_products(user_id, child_id, created_at desc);
create index if not exists idx_saved_products_kind on public.saved_products(kind);
create index if not exists idx_product_alternatives_status on public.product_alternatives(status);
create index if not exists idx_product_alternatives_allergen on public.product_alternatives(allergen);

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

drop trigger if exists set_saved_products_updated_at on public.saved_products;
create trigger set_saved_products_updated_at
before update on public.saved_products
for each row execute function public.set_updated_at();

drop trigger if exists set_product_alternatives_updated_at on public.product_alternatives;
create trigger set_product_alternatives_updated_at
before update on public.product_alternatives
for each row execute function public.set_updated_at();

-- RLS
alter table public.analysis_history enable row level security;
alter table public.saved_products enable row level security;
alter table public.product_alternatives enable row level security;

-- analysis_history: cada usuario ve/crea/borra lo suyo
drop policy if exists "Users can read own analysis history" on public.analysis_history;
create policy "Users can read own analysis history"
on public.analysis_history for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own analysis history" on public.analysis_history;
create policy "Users can insert own analysis history"
on public.analysis_history for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own analysis history" on public.analysis_history;
create policy "Users can delete own analysis history"
on public.analysis_history for delete
using (auth.uid() = user_id);

-- saved_products: cada usuario gestiona lo suyo
drop policy if exists "Users can read own saved products" on public.saved_products;
create policy "Users can read own saved products"
on public.saved_products for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own saved products" on public.saved_products;
create policy "Users can insert own saved products"
on public.saved_products for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own saved products" on public.saved_products;
create policy "Users can update own saved products"
on public.saved_products for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own saved products" on public.saved_products;
create policy "Users can delete own saved products"
on public.saved_products for delete
using (auth.uid() = user_id);

-- product_alternatives: usuarios autenticados leen activas; admin gestiona
-- Nota: ajusta el email si cambia el administrador.
drop policy if exists "Authenticated users can read active alternatives" on public.product_alternatives;
create policy "Authenticated users can read active alternatives"
on public.product_alternatives for select
using (auth.role() = 'authenticated' and status = 'active' or (auth.jwt() ->> 'email') = 'jsantospro3@gmail.com');

drop policy if exists "Admin can insert alternatives" on public.product_alternatives;
create policy "Admin can insert alternatives"
on public.product_alternatives for insert
with check ((auth.jwt() ->> 'email') = 'jsantospro3@gmail.com');

drop policy if exists "Admin can update alternatives" on public.product_alternatives;
create policy "Admin can update alternatives"
on public.product_alternatives for update
using ((auth.jwt() ->> 'email') = 'jsantospro3@gmail.com')
with check ((auth.jwt() ->> 'email') = 'jsantospro3@gmail.com');

drop policy if exists "Admin can delete alternatives" on public.product_alternatives;
create policy "Admin can delete alternatives"
on public.product_alternatives for delete
using ((auth.jwt() ->> 'email') = 'jsantospro3@gmail.com');

-- Alternativas iniciales demo
insert into public.product_alternatives (allergen, category, trigger_text, suggestion, status)
values
('leche', 'general', 'leche, caseína, lactosuero, proteína láctea', 'Buscar versión sin leche y sin trazas. Revisar especialmente caseína, lactosuero, proteína láctea y leche en polvo.', 'active'),
('gluten', 'general', 'gluten, trigo, cebada, centeno', 'Buscar producto certificado sin gluten. Evitar trigo, cebada, centeno, espelta, sémola y malta.', 'active'),
('huevo', 'general', 'huevo, albúmina, clara', 'Buscar alternativa sin huevo o versión vegana. Revisar albúmina, clara, huevo en polvo y lisozima.', 'active'),
('soja', 'general', 'soja, lecitina de soja, proteína de soja', 'Revisar si la lecitina de soja es relevante para el perfil. Para alergia grave, buscar producto sin soja ni derivados.', 'active'),
('general', 'restaurante', 'plato, menú, restaurante', 'En restaurante, pedir ficha de alérgenos y confirmar contaminación cruzada por escrito antes de consumir.', 'active')
on conflict do nothing;

NOTIFY pgrst, 'reload schema';
