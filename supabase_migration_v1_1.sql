-- SafeBite V1.1 — Base Experta Laztan
-- Ejecutar en Supabase > SQL Editor.

create extension if not exists pgcrypto;

-- 1) Bucket privado para documentación experta
insert into storage.buckets (id, name, public)
values ('expert-documents', 'expert-documents', false)
on conflict (id) do nothing;

-- 2) Documentos internos de conocimiento experto
create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text default 'general',
  document_type text default 'protocolo',
  content_text text,
  file_path text,
  file_name text,
  file_size bigint,
  status text not null default 'active' check (status in ('active','draft','archived')),
  priority int not null default 10,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) Reglas estructuradas de alérgenos / derivados ocultos
create table if not exists public.allergen_rules (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text not null,
  aliases jsonb not null default '[]'::jsonb,
  allergen text not null,
  risk_level text not null default 'alto' check (risk_level in ('alto','medio','bajo')),
  explanation text,
  source_document_id uuid references public.knowledge_documents(id) on delete set null,
  status text not null default 'active' check (status in ('active','draft','archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) Evidencias de análisis opcionales para trazabilidad avanzada
create table if not exists public.analysis_evidence (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid,
  user_id uuid references auth.users(id) on delete cascade,
  child_id uuid,
  status text,
  evidence jsonb not null default '[]'::jsonb,
  rules_applied jsonb not null default '[]'::jsonb,
  documents_used jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_knowledge_documents_status on public.knowledge_documents(status);
create index if not exists idx_knowledge_documents_category on public.knowledge_documents(category);
create index if not exists idx_allergen_rules_status on public.allergen_rules(status);
create index if not exists idx_allergen_rules_allergen on public.allergen_rules(allergen);

-- 5) Updated_at automático
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_knowledge_documents_updated_at on public.knowledge_documents;
create trigger trg_knowledge_documents_updated_at
before update on public.knowledge_documents
for each row execute function public.set_updated_at();

drop trigger if exists trg_allergen_rules_updated_at on public.allergen_rules;
create trigger trg_allergen_rules_updated_at
before update on public.allergen_rules
for each row execute function public.set_updated_at();

-- 6) Seguridad RLS
alter table public.knowledge_documents enable row level security;
alter table public.allergen_rules enable row level security;
alter table public.analysis_evidence enable row level security;

-- Cambia aquí si tu email admin es otro.
-- El frontend también usa ADMIN_EMAIL = jsantospro3@gmail.com.
drop policy if exists "Admin full access knowledge documents" on public.knowledge_documents;
create policy "Admin full access knowledge documents"
on public.knowledge_documents
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'jsantospro3@gmail.com')
with check ((auth.jwt() ->> 'email') = 'jsantospro3@gmail.com');

drop policy if exists "Admin full access allergen rules" on public.allergen_rules;
create policy "Admin full access allergen rules"
on public.allergen_rules
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'jsantospro3@gmail.com')
with check ((auth.jwt() ->> 'email') = 'jsantospro3@gmail.com');

drop policy if exists "Users read own analysis evidence" on public.analysis_evidence;
create policy "Users read own analysis evidence"
on public.analysis_evidence
for select
to authenticated
using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'jsantospro3@gmail.com');

drop policy if exists "Admin full access analysis evidence" on public.analysis_evidence;
create policy "Admin full access analysis evidence"
on public.analysis_evidence
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'jsantospro3@gmail.com')
with check ((auth.jwt() ->> 'email') = 'jsantospro3@gmail.com');

-- Storage: solo admin puede gestionar archivos expertos.
drop policy if exists "Admin upload expert documents" on storage.objects;
create policy "Admin upload expert documents"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'expert-documents' and (auth.jwt() ->> 'email') = 'jsantospro3@gmail.com');

drop policy if exists "Admin read expert documents" on storage.objects;
create policy "Admin read expert documents"
on storage.objects
for select
to authenticated
using (bucket_id = 'expert-documents' and (auth.jwt() ->> 'email') = 'jsantospro3@gmail.com');

drop policy if exists "Admin delete expert documents" on storage.objects;
create policy "Admin delete expert documents"
on storage.objects
for delete
to authenticated
using (bucket_id = 'expert-documents' and (auth.jwt() ->> 'email') = 'jsantospro3@gmail.com');

-- 7) Reglas iniciales SafeBite / Laztan editables
insert into public.allergen_rules (ingredient_name, aliases, allergen, risk_level, explanation, status)
values
('caseinato', '["caseína", "caseinato sódico", "caseinato cálcico", "proteína láctea", "proteínas lácteas", "suero lácteo", "lactosuero", "lactoglobulina", "lactoalbúmina"]', 'leche', 'alto', 'Derivado proteico de la leche.', 'active'),
('albúmina', '["albumina", "ovoalbúmina", "ovoalbumina", "lisozima", "clara de huevo", "huevo en polvo"]', 'huevo', 'alto', 'Proteína o derivado del huevo.', 'active'),
('sémola', '["semola", "espelta", "cebada", "centeno", "malta", "almidón de trigo", "almidon de trigo", "trigo", "kamut"]', 'gluten', 'alto', 'Cereal con gluten o derivado.', 'active'),
('tahini', '["tahina", "pasta de sésamo", "pasta de sesamo", "semillas de sésamo", "semillas de sesamo"]', 'sesamo', 'alto', 'Derivado directo del sésamo.', 'active'),
('lecitina de soja', '["soja", "proteína de soja", "proteina de soja", "harina de soja", "aceite de soja"]', 'soja', 'medio', 'Derivado de soja.', 'active'),
('cacahuete', '["maní", "mani", "arachis hypogaea"]', 'cacahuete', 'alto', 'Cacahuete o derivado.', 'active'),
('frutos secos', '["almendra", "avellana", "nuez", "pistacho", "anacardo", "castaña de cajú", "pecana", "macadamia"]', 'frutos', 'alto', 'Fruto seco o derivado.', 'active'),
('sulfito', '["sulfitos", "dióxido de azufre", "dioxido de azufre", "e220", "e221", "e222", "e223", "e224", "e226", "e227", "e228"]', 'sulfitos', 'medio', 'Sulfito o conservante relacionado.', 'active')
on conflict do nothing;
