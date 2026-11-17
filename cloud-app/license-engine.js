// Pure license decisions for use by authenticated Cloudflare Pages Functions.
// Tenant identity MUST come from a verified server session, never a request parameter.
export function evaluateLicense({license,entitlements=[],feature,now=Math.floor(Date.now()/1000)}) {
  if (!license) return {allowed:false,reason:"license_missing"};
  const active = license.status==="active" && license.period_start!=null && license.period_end!=null && Number(license.period_start)<=now && now<Number(license.period_end);
  const grace = ["past_due","grace"].includes(license.status) && license.grace_until!=null && Number(license.grace_until)>now;
  if (!active && !grace) return {allowed:false,reason:"license_inactive"};
  if (feature && !entitlements.some(e=>e.feature_key===feature && Number(e.enabled)===1))
    return {allowed:false,reason:"feature_not_in_plan"};
  return {allowed:true,reason:grace?"grace_period":"active"};
}
export async function authorizeFeature(db,session,feature,clock=Math.floor(Date.now()/1000)) {
  if (!session?.tenant_id || !session?.user_id) return {allowed:false,reason:"unauthenticated"};
  // Only session-derived tenant ID is used. Company isolation is enforced separately on each business query.
  const license=await db.prepare("SELECT * FROM tenant_licenses WHERE tenant_id=? ORDER BY created_at DESC LIMIT 1").bind(session.tenant_id).first();
  if (!license) return {allowed:false,reason:"license_missing"};
  const rows=(await db.prepare("SELECT feature_key,enabled FROM license_entitlements WHERE plan_code=?").bind(license.plan_code).all()).results||[];
  return evaluateLicense({license,entitlements:rows,feature,now:clock});
}
export function canExport({license,now=Math.floor(Date.now()/1000)}) {
  return !!license && license.export_until!=null && Number(license.export_until)>now;
}
export function canAddSeat({licensed,used}) {
  return licensed===null || (Number.isInteger(licensed) && Number.isInteger(used) && used>=0 && used<licensed);
}
