-- Square Sandbox payment/event persistence foundation — development Supabase ONLY.
-- This migration creates no payments, changes no receipts, and activates no charges.
-- The development POS sales table has UNIQUE (company_id, id) already.

create table if not exists public.nexus_square_sandbox_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.nexus_companies(id) on delete restrict,
  sale_id uuid not null,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{8,45}$'),
  square_location_id text not null check (char_length(square_location_id) between 4 and 100),
  amount_cents bigint not null check (amount_cents between 1 and 100000000),
  currency text not null default 'USD' check (currency = 'USD'),
  provider_payment_id text unique,
  status text not null default 'prepared'
    check (status in ('prepared','submitted','pending','completed_unreconciled','failed','reconciled','refunded')),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id,id),
  unique (company_id,idempotency_key),
  foreign key (company_id,sale_id)
    references public.nexus_pos_sales(company_id,id)
    on delete restrict
);
create index if not exists nexus_square_sandbox_attempt_company_sale_idx
  on public.nexus_square_sandbox_payment_attempts(company_id,sale_id,created_at desc);

create table if not exists public.nexus_square_sandbox_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique check(char_length(provider_event_id) between 8 and 200),
  company_id uuid not null references public.nexus_companies(id) on delete restrict,
  payment_attempt_id uuid not null,
  event_type text not null check(char_length(event_type) between 3 and 120),
  raw_body_sha256 text not null check(raw_body_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'received' check(status in ('received','ignored','rejected','applied')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  foreign key (company_id,payment_attempt_id)
    references public.nexus_square_sandbox_payment_attempts(company_id,id)
    on delete restrict
);
create index if not exists nexus_square_sandbox_events_company_created_idx
  on public.nexus_square_sandbox_webhook_events(company_id,received_at desc);

alter table public.nexus_square_sandbox_payment_attempts enable row level security;
alter table public.nexus_square_sandbox_webhook_events enable row level security;
-- Intentionally NO client policies. Only the trusted server service-role may access.
revoke all on public.nexus_square_sandbox_payment_attempts,public.nexus_square_sandbox_webhook_events
  from public,anon,authenticated;
grant select,insert,update,delete on public.nexus_square_sandbox_payment_attempts,
  public.nexus_square_sandbox_webhook_events to service_role;
