alter table public.lead_messages
  add column if not exists opened_at timestamptz,
  add column if not exists first_opened_at timestamptz,
  add column if not exists open_count integer not null default 0,
  add column if not exists clicked_at timestamptz,
  add column if not exists first_clicked_at timestamptz,
  add column if not exists click_count integer not null default 0,
  add column if not exists tracking_token text,
  add column if not exists preview_url text;

create unique index if not exists lead_messages_tracking_token_key
on public.lead_messages (tracking_token)
where tracking_token is not null;

create index if not exists lead_messages_engagement_idx
on public.lead_messages (clicked_at desc, opened_at desc)
where direction = 'outbound';
