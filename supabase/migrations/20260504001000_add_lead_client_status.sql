alter table public.leads
add column if not exists status text default 'lead';

update public.leads
set status = 'lead'
where status is null or status = '' or status = 'new' or status = 'archived';

update public.leads
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{status}',
  to_jsonb(status),
  true
)
where data is null
  or coalesce(data->>'status', '') in ('', 'new', 'archived');
