-- Nexus POS + CRM Supabase development foundation.
-- Clients have SELECT-only access through member-scoped RLS.
-- All writes require a separately authenticated server-side service.
create table public.nexus_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 150),
  created_at timestamptz not null default now()
);
create table public.nexus_company_members (
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','employee')),
  created_at timestamptz not null default now(),
  primary key (company_id,user_id)
);
create index nexus_members_user_idx on public.nexus_company_members(user_id,company_id);

create table public.nexus_pos_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  sku text not null check (sku ~ '^[-A-Za-z0-9_]{1,60}$'),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  price_cents bigint not null check (price_cents between 0 and 100000000),
  stock_quantity integer not null default 0 check (stock_quantity between 0 and 1000000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,sku),
  unique(company_id,id)
);
create index nexus_pos_products_company_idx on public.nexus_pos_products(company_id,name);

create table public.nexus_pos_sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  status text not null default 'recorded' check(status in ('recorded','voided','partially_refunded','refunded')),
  subtotal_cents bigint not null check(subtotal_cents between 0 and 1000000000),
  tax_cents bigint not null default 0 check(tax_cents between 0 and 1000000000),
  total_cents bigint generated always as (subtotal_cents + tax_cents) stored,
  idempotency_key text not null check(char_length(idempotency_key) between 8 and 100),
  created_at timestamptz not null default now(),
  unique(company_id,id),
  unique(company_id,idempotency_key)
);
create index nexus_pos_sales_company_created on public.nexus_pos_sales(company_id,created_at desc);

create table public.nexus_pos_sale_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  sale_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  quantity integer not null check(quantity between 1 and 1000),
  unit_price_cents bigint not null check(unit_price_cents >= 0),
  line_total_cents bigint generated always as (quantity * unit_price_cents) stored,
  foreign key(company_id,sale_id) references public.nexus_pos_sales(company_id,id),
  foreign key(company_id,product_id) references public.nexus_pos_products(company_id,id)
);
create index nexus_pos_items_sale on public.nexus_pos_sale_items(company_id,sale_id);

create table public.nexus_pos_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  sale_id uuid,
  quantity_delta integer not null check(quantity_delta <> 0),
  reason text not null check(reason in ('opening_stock','restock','sale','refund','correction')),
  created_at timestamptz not null default now(),
  foreign key(company_id,product_id) references public.nexus_pos_products(company_id,id),
  foreign key(company_id,sale_id) references public.nexus_pos_sales(company_id,id)
);
create index nexus_pos_movements_company on public.nexus_pos_inventory_movements(company_id,product_id,created_at desc);

alter table public.nexus_companies enable row level security;
alter table public.nexus_company_members enable row level security;
alter table public.nexus_pos_products enable row level security;
alter table public.nexus_pos_sales enable row level security;
alter table public.nexus_pos_sale_items enable row level security;
alter table public.nexus_pos_inventory_movements enable row level security;

revoke all on table public.nexus_companies,public.nexus_company_members,public.nexus_pos_products,public.nexus_pos_sales,public.nexus_pos_sale_items,public.nexus_pos_inventory_movements from anon,authenticated;
grant select on table public.nexus_companies,public.nexus_company_members,public.nexus_pos_products,public.nexus_pos_sales,public.nexus_pos_sale_items,public.nexus_pos_inventory_movements to authenticated;

create policy nexus_members_self_read on public.nexus_company_members for select to authenticated
using (user_id = (select auth.uid()));

create policy nexus_company_member_read on public.nexus_companies for select to authenticated
using (exists(select 1 from public.nexus_company_members m where m.company_id=id and m.user_id=(select auth.uid())));

create policy nexus_pos_products_admin_read on public.nexus_pos_products for select to authenticated
using (exists(select 1 from public.nexus_company_members m where m.company_id=nexus_pos_products.company_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));

create policy nexus_pos_sales_admin_read on public.nexus_pos_sales for select to authenticated
using (exists(select 1 from public.nexus_company_members m where m.company_id=nexus_pos_sales.company_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));

create policy nexus_pos_items_admin_read on public.nexus_pos_sale_items for select to authenticated
using (exists(select 1 from public.nexus_company_members m where m.company_id=nexus_pos_sale_items.company_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));

create policy nexus_pos_movements_admin_read on public.nexus_pos_inventory_movements for select to authenticated
using (exists(select 1 from public.nexus_company_members m where m.company_id=nexus_pos_inventory_movements.company_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));

-- Creates a single recorded sale and all stock movements in the same transaction.
-- Callable by the service role only; its caller must independently verify the
-- end-user access token and pass the verified Supabase Auth user UUID as p_actor_id.
create function public.nexus_record_pos_sale(
 p_company_id uuid,
 p_actor_id uuid,
 p_items jsonb,
 p_idempotency_key text
) returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
 v_sale uuid;
 v_product record;
 v_item jsonb;
 v_id uuid;
 v_qty integer;
 v_seen uuid[] := '{}';
 v_subtotal bigint := 0;
 v_count integer;
begin
 if current_user <> 'service_role' then
  raise exception 'Server role required' using errcode='42501';
 end if;
 if p_actor_id is null or p_company_id is null
  or p_idempotency_key is null or p_idempotency_key !~ '^[a-zA-Z0-9_-]{8,100}$'
  or jsonb_typeof(p_items) is distinct from 'array' then
  raise exception 'Invalid request' using errcode='22023';
 end if;
 v_count:=jsonb_array_length(p_items);
 if v_count < 1 or v_count > 50 then raise exception 'Invalid item count' using errcode='22023'; end if;
 if not exists(select 1 from public.nexus_company_members where company_id=p_company_id and user_id=p_actor_id and role in ('owner','admin')) then
  raise exception 'Not authorized for company' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text || ':' || p_idempotency_key,0));
 select id into v_sale from public.nexus_pos_sales where company_id=p_company_id and idempotency_key=p_idempotency_key;
 if found then return v_sale; end if;
 for v_item in select value from jsonb_array_elements(p_items) as t(value) order by (value->>'product_id') loop
  if jsonb_typeof(v_item) is distinct from 'object' then raise exception 'Invalid item' using errcode='22023'; end if;
  v_id:=(v_item->>'product_id')::uuid;
  v_qty:=(v_item->>'quantity')::integer;
  if v_id is null or v_qty is null or v_qty < 1 or v_qty > 1000 or v_id=any(v_seen) then
   raise exception 'Invalid or repeated product' using errcode='22023';
  end if;
  v_seen:=array_append(v_seen,v_id);
  select id,name,price_cents,stock_quantity into v_product
  from public.nexus_pos_products
  where company_id=p_company_id and id=v_id and active=true for update;
  if not found or v_product.stock_quantity < v_qty then
   raise exception 'Out of stock or inaccessible product' using errcode='23514';
  end if;
  v_subtotal:=v_subtotal + v_qty * v_product.price_cents;
  if v_subtotal > 1000000000 then raise exception 'Sale exceeds limit' using errcode='22003'; end if;
 end loop;
 insert into public.nexus_pos_sales(company_id,subtotal_cents,tax_cents,idempotency_key)
 values(p_company_id,v_subtotal,0,p_idempotency_key) returning id into v_sale;
 for v_item in select value from jsonb_array_elements(p_items) as t(value) order by (value->>'product_id') loop
  v_id:=(v_item->>'product_id')::uuid;
  v_qty:=(v_item->>'quantity')::integer;
  select name,price_cents into v_product from public.nexus_pos_products where company_id=p_company_id and id=v_id;
  update public.nexus_pos_products set stock_quantity=stock_quantity-v_qty,updated_at=now()
  where company_id=p_company_id and id=v_id and stock_quantity >= v_qty;
  if not found then raise exception 'Stock changed during checkout' using errcode='23514'; end if;
  insert into public.nexus_pos_sale_items(company_id,sale_id,product_id,product_name,quantity,unit_price_cents)
  values(p_company_id,v_sale,v_id,v_product.name,v_qty,v_product.price_cents);
  insert into public.nexus_pos_inventory_movements(company_id,product_id,sale_id,quantity_delta,reason)
  values(p_company_id,v_id,v_sale,-v_qty,'sale');
 end loop;
 return v_sale;
end $$;
revoke all on function public.nexus_record_pos_sale(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.nexus_record_pos_sale(uuid,uuid,jsonb,text) to service_role;
