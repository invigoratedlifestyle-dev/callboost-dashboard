alter table public.leads
add column if not exists status text not null default 'new';

alter table public.leads
add column if not exists status_updated_at timestamptz;

alter table public.leads
add column if not exists last_activity_at timestamptz;

update public.leads
set status = 'new'
where status is null
  or btrim(status) = '';

update public.leads
set status_updated_at = coalesce(updated_at, created_at, now())
where status_updated_at is null;

update public.leads
set last_activity_at = coalesce(updated_at, created_at, now())
where last_activity_at is null;

create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_status_updated_at_idx
  on public.leads(status_updated_at desc);
create index if not exists leads_last_activity_at_idx
  on public.leads(last_activity_at desc);
