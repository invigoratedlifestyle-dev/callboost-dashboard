update public.leads
set
  status = 'waiting_client',
  status_updated_at = now(),
  last_activity_at = coalesce(last_activity_at, updated_at, created_at, now())
where stage = 'contacted'
  and status not in ('waiting_client', 'replied', 'closed');

update public.leads
set
  status = 'closed',
  status_updated_at = case
    when status is distinct from 'closed' then now()
    else status_updated_at
  end,
  last_activity_at = coalesce(last_activity_at, updated_at, created_at, now())
where stage = 'archived'
  and status is distinct from 'closed';
