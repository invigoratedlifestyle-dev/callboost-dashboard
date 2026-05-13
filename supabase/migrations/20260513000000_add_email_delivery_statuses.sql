alter table public.lead_messages
  drop constraint if exists lead_messages_status_check;

alter table public.lead_messages
  add constraint lead_messages_status_check
  check (status in ('draft', 'sent', 'delivered', 'bounced', 'failed', 'received'));

create index if not exists lead_messages_bounced_email_idx
on public.lead_messages (created_at desc)
where channel = 'email'
  and direction = 'outbound'
  and status = 'bounced';
