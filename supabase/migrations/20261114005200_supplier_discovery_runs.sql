create table if not exists public.supplier_discovery_runs (
  id uuid primary key default gen_random_uuid(),

  candidate_id uuid not null
    references public.product_candidates(id),

  research_text text not null,
  grounding_sources jsonb not null default '[]',

  extraction_result jsonb,
  status text not null default 'researched'
    check (status in (
      'researched',
      'extracted',
      'failed'
    )),

  created_at timestamptz not null default now()
);

create index if not exists supplier_discovery_runs_candidate_idx
on public.supplier_discovery_runs(candidate_id);

alter table public.supplier_discovery_runs
enable row level security;
