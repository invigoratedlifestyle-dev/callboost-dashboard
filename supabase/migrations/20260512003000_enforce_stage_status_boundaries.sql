update public.leads
set
  status = 'closed',
  status_updated_at = now(),
  last_activity_at = coalesce(last_activity_at, updated_at, created_at, now())
where stage = 'archived'
  and status is distinct from 'closed';

update public.leads
set
  status = 'paid',
  status_updated_at = now(),
  last_activity_at = coalesce(last_activity_at, updated_at, created_at, now())
where stage = 'client'
  and status is distinct from 'paid';
