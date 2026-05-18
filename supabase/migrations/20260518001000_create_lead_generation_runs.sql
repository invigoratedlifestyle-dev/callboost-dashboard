create table if not exists lead_generation_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  trade text not null,
  state_code text,
  towns text[] not null default '{}',
  requested_limit integer,
  leads_found integer not null default 0,
  leads_created integer not null default 0,
  duplicates_skipped integer not null default 0,
  no_opportunity_skipped integer not null default 0,
  enrichment_failed integer not null default 0,
  total_skipped integer not null default 0,
  duration_ms integer,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists lead_generation_runs_created_at_idx
  on lead_generation_runs (created_at desc);

create index if not exists lead_generation_runs_status_idx
  on lead_generation_runs (status);
