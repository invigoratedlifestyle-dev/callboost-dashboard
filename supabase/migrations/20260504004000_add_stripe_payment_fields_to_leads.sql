alter table leads
add column if not exists stripe_customer_id text,
add column if not exists stripe_checkout_session_id text,
add column if not exists stripe_subscription_id text,
add column if not exists payment_status text,
add column if not exists paid_at timestamptz,
add column if not exists client_started_at timestamptz;
