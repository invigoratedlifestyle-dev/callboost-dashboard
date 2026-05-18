create table if not exists public.notification_dismissals (
  id uuid primary key default gen_random_uuid(),
  notification_key text not null unique,
  notification_type text,
  lead_slug text,
  dismissed_at timestamptz not null default now()
);

create index if not exists notification_dismissals_lead_slug_idx
on public.notification_dismissals (lead_slug);
