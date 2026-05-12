do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'status'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'stage'
  ) then
    alter table public.leads rename column status to stage;
  elsif not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'stage'
  ) then
    alter table public.leads add column stage text default 'lead';
  end if;
end $$;

update public.leads
set stage = lower(stage)
where stage is not null;

update public.leads
set stage = 'lead'
where stage is null
  or stage = ''
  or stage = 'new';

update public.leads
set stage = 'contacted'
where stage = 'interested';

alter table public.leads
alter column stage set default 'lead';

update public.leads
set data = jsonb_set(
  jsonb_set(
    coalesce(data, '{}'::jsonb),
    '{stage}',
    to_jsonb(stage),
    true
  ),
  '{status}',
  to_jsonb(stage),
  true
)
where data is null
  or coalesce(data->>'stage', '') is distinct from coalesce(stage, '')
  or coalesce(data->>'status', '') in ('', 'new', 'interested');

create index if not exists leads_stage_idx on public.leads(stage);
