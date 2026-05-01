alter table public.lead_messages
  drop constraint if exists lead_messages_status_check;

alter table public.lead_messages
  add constraint lead_messages_status_check
  check (status in ('draft', 'sent', 'failed', 'received'));

alter table public.lead_messages
  drop constraint if exists lead_messages_direction_check;

alter table public.lead_messages
  add constraint lead_messages_direction_check
  check (direction in ('inbound', 'outbound'));
