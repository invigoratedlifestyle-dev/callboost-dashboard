update public.leads
set status = 'lead'
where status is null;

update public.leads
set status = 'lead'
where status = 'new' or status = '';

update public.leads
set status = 'contacted'
where status = 'interested';

update public.leads
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{status}',
  to_jsonb(status),
  true
)
where data is null
  or coalesce(data->>'status', '') in ('', 'new', 'interested');
