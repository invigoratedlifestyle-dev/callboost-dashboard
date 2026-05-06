create table if not exists public.site_assets (
  id uuid primary key default gen_random_uuid(),
  trade text not null,
  asset_type text not null default 'hero',
  image_url text not null,
  storage_path text not null,
  alt_text text,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists site_assets_trade_asset_type_idx
on public.site_assets (trade, asset_type);

insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do update
set public = excluded.public;
