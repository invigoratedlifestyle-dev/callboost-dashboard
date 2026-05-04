alter table public.lead_messages
add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists lead_messages_payment_recovery_idx
on public.lead_messages ((metadata->>'stripe_invoice_id'))
where metadata->>'reason' = 'payment_failed_recovery';
