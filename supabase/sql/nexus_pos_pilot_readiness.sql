-- Development-only Supabase POS readiness; do not run on the production database.
-- Every recorded sale is unpaid until payment processing confirms settlement.
ALTER TABLE public.nexus_pos_sales
  DROP CONSTRAINT IF EXISTS nexus_pos_sales_status_check;
ALTER TABLE public.nexus_pos_sales
  ADD CONSTRAINT nexus_pos_sales_status_check
  CHECK(status IN ('pending','recorded','voided','partially_refunded','refunded'));
ALTER TABLE public.nexus_pos_sales ALTER COLUMN status SET DEFAULT 'pending';

-- Create products and initial inventory movements as one transaction (atomic RPC).
CREATE OR REPLACE FUNCTION public.nexus_create_pos_product(
  p_company_id uuid,
  p_actor_id uuid,
  p_sku text,
  p_name text,
  p_price_cents bigint,
  p_stock_quantity integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Server role required' USING errcode='42501';
  END IF;
  IF p_company_id IS NULL OR p_actor_id IS NULL
     OR p_sku IS NULL OR p_sku !~ '^[-A-Za-z0-9_]{1,60}$'
     OR p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 200
     OR p_price_cents IS NULL OR p_price_cents NOT BETWEEN 0 AND 100000000
     OR p_stock_quantity IS NULL OR p_stock_quantity NOT BETWEEN 0 AND 1000000 THEN
     RAISE EXCEPTION 'Invalid product input' USING errcode='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.nexus_company_members
    WHERE company_id=p_company_id AND user_id=p_actor_id
      AND role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized for company' USING errcode='42501';
  END IF;
  INSERT INTO public.nexus_pos_products(
    company_id,sku,name,price_cents,stock_quantity
  ) VALUES(
    p_company_id,p_sku,btrim(p_name),p_price_cents,p_stock_quantity
  ) RETURNING id INTO v_id;
  IF p_stock_quantity > 0 THEN
    INSERT INTO public.nexus_pos_inventory_movements(
      company_id,product_id,sale_id,quantity_delta,reason
    ) VALUES (
      p_company_id,v_id,NULL,p_stock_quantity,'opening_stock'
    );
  END IF;
  RETURN v_id;
END
$$;
REVOKE ALL ON FUNCTION public.nexus_create_pos_product(uuid,uuid,text,text,bigint,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_create_pos_product(uuid,uuid,text,text,bigint,integer)
  TO service_role;
