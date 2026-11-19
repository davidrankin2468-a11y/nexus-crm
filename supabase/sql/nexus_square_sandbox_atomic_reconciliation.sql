-- Development-only Square sandbox reconciliation. Do not enable production charges.
-- Caller must verify Square payment server-side (GET /v2/payments/{id}) immediately
-- before invoking this RPC. Never call this from the browser or a webhook payload.
create or replace function public.nexus_reconcile_square_sandbox_payment(
 p_company_id uuid, p_attempt_id uuid, p_payment_id text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare a record; s record; other_count integer;
begin
 if p_company_id is null or p_attempt_id is null or p_payment_id is null then
  raise exception 'Invalid reconciliation request';
 end if;
 -- Lock the attempt and sale within one database transaction.
 select * into a from public.nexus_square_sandbox_payment_attempts
  where company_id=p_company_id and id=p_attempt_id for update;
 if not found or a.provider_payment_id is distinct from p_payment_id
   or a.currency <> 'USD' or a.status not in ('completed_unreconciled','reconciled') then
  raise exception 'Payment attempt not eligible';
 end if;
 select * into s from public.nexus_pos_sales
  where company_id=p_company_id and id=a.sale_id for update;
 if not found or s.total_cents <> a.amount_cents or s.tax_cents < 0 then
  raise exception 'Sale and payment amount mismatch';
 end if;
 if a.status='reconciled' then
  if s.status <> 'recorded' then raise exception 'Inconsistent reconciliation'; end if;
  return jsonb_build_object('reconciled',true,'already_reconciled',true,'sale_id',s.id);
 end if;
 if s.status <> 'pending' then raise exception 'Sale not pending'; end if;
 select count(*) into other_count from public.nexus_square_sandbox_payment_attempts
  where company_id=p_company_id and sale_id=s.id and id<>a.id
    and status in ('completed_unreconciled','reconciled');
 if other_count>0 then raise exception 'Competing payment requires manual review'; end if;
 update public.nexus_pos_sales set status='recorded'
  where company_id=p_company_id and id=s.id and status='pending';
 if not found then raise exception 'Sale transition failed'; end if;
 update public.nexus_square_sandbox_payment_attempts
  set status='reconciled',updated_at=now()
  where company_id=p_company_id and id=a.id and status='completed_unreconciled';
 if not found then raise exception 'Attempt transition failed'; end if;
 return jsonb_build_object('reconciled',true,'already_reconciled',false,'sale_id',s.id);
end $$;
revoke all on function public.nexus_reconcile_square_sandbox_payment(uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function public.nexus_reconcile_square_sandbox_payment(uuid,uuid,text)
 to service_role;
