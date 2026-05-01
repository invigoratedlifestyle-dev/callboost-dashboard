create table if not exists public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  slug text,
  channel text not null check (channel in ('sms', 'email')),
  direction text not null default 'outbound',
  to_address text,
  from_address text,
  subject text,
  body text not null,
  status text not null default 'sent' check (status in ('draft', 'sent', 'failed')),
  provider text,
  provider_message_id text,
  error text,
  created_at timestamptz default now()
);

create index if not exists lead_messages_lead_id_idx
  on public.lead_messages (lead_id);

create index if not exists lead_messages_slug_idx
  on public.lead_messages (slug);

create index if not exists lead_messages_created_at_idx
  on public.lead_messages (created_at desc);
