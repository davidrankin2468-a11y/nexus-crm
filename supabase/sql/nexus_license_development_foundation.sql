-- Nexus CRM commercial licensing foundation, DEVELOPMENT Supabase project only.
-- No payments or entitlements are activated by applying this migration.
create table if not exists public.nexus_license_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code ~ '^[a-z0-9_-]{3,64}$'),
  display_name text not null check(char_length(btrim(display_name)) between 1 and 120),
  billing_mode text not null check(billing_mode in ('monthly','one_time')),
  price_cents bigint not null check(price_cents between 0 and 100000000),
  currency text not null default 'USD' check(currency='USD'),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.nexus_company_licenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  plan_id uuid not null references public.nexus_license_plans(id),
  status text not null default 'pending' check(status in ('pending','trial','active','suspended','expired','cancelled')),
  provider text not null default 'manual' check(provider in ('manual','square')),
  provider_subscription_id text,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id,id),
  check(activated_at is null or status <> 'pending'),
  check(expires_at is null or activated_at is null or expires_at >= activated_at)
);
create index if not exists nexus_company_licenses_company_status_idx
  on public.nexus_company_licenses(company_id,status);
create unique index if not exists nexus_company_licenses_provider_subscription_idx
  on public.nexus_company_licenses(provider,provider_subscription_id)
  where provider_subscription_id is not null;
create table if not exists public.nexus_license_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  license_id uuid not null,
  event_key text not null check(char_length(event_key) between 8 and 150),
  event_type text not null check(event_type in ('created','activated','renewal_pending','renewed','payment_failed','suspended','cancelled','expired','refunded')),
  provider text not null default 'manual' check(provider in ('manual','square')),
  provider_event_id text,
  created_at timestamptz not null default now(),
  foreign key (company_id,license_id) references public.nexus_company_licenses(company_id,id) on delete cascade,
  unique (company_id,event_key)
);
create unique index if not exists nexus_license_events_provider_event_unique_idx
  on public.nexus_license_events(provider,provider_event_id)
  where provider_event_id is not null;
create index if not exists nexus_license_events_company_created_idx
  on public.nexus_license_events(company_id,created_at desc);
alter table public.nexus_license_plans enable row level security;
alter table public.nexus_company_licenses enable row level security;
alter table public.nexus_license_events enable row level security;
-- No user-facing policies until the licensing UX is ready; all writes server-only.
revoke all on public.nexus_license_plans, public.nexus_company_licenses, public.nexus_license_events from public,anon,authenticated;
grant select,insert,update,delete on public.nexus_license_plans, public.nexus_company_licenses, public.nexus_license_events to service_role;
