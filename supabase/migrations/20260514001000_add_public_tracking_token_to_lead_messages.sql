alter table public.lead_messages
  add column if not exists public_tracking_token text;

create unique index if not exists lead_messages_public_tracking_token_key
on public.lead_messages (public_tracking_token)
where public_tracking_token is not null;
