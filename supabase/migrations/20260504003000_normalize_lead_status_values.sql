update public.leads
set status = 'lead'
where status is null;

update public.leads
set status = lower(status)
where status is not null;

update public.leads
set status = 'lead'
where status = 'new' or status = '';

update public.leads
set status = 'contacted'
where status = 'interested';

alter table public.leads
alter column status set default 'lead';
