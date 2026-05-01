create table if not exists public.callbacks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  source_slug text not null,
  visitor_name text not null,
  visitor_phone text not null,
  visitor_message text not null default '',
  forwarded boolean not null default false,
  forwarded_to text,
  created_at timestamptz not null default now()
);

create index if not exists callbacks_lead_id_idx
  on public.callbacks (lead_id);

create index if not exists callbacks_source_slug_idx
  on public.callbacks (source_slug);

create index if not exists callbacks_created_at_idx
  on public.callbacks (created_at desc);
