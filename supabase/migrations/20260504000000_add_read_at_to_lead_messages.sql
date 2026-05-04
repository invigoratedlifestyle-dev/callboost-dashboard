alter table public.lead_messages
add column if not exists read_at timestamptz;

create index if not exists lead_messages_unread_inbound_idx
on public.lead_messages (created_at desc)
where direction = 'inbound' and read_at is null;
