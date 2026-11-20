// Nexus CRM + POS — two independent commercial payment workstreams.
// This is a NO-CHARGE launch gate and routing contract, not a Square connector.
// Never accept a production payment until a separately reviewed provider integration
// and all independent launch controls are complete.
export const PAYMENT_LANES=Object.freeze({
 SOFTWARE:"nexus_software",
 COMPANY_POS:"company_pos"
});
export const SOFTWARE_DRAFT_PLANS=Object.freeze({
 crm_starter_monthly_draft:4900,
 crm_growth_monthly_draft:9900,
 crm_pro_monthly_draft:14900
});
const COMMON=[
 "merchantAccountVerified","bankPayoutVerified","webhookSignatureVerified",
 "idempotencyAndReconciliationVerified","refundAndFailureTested",
 "privacyTermsApproved","taxReviewed","ownerAcceptanceApproved"
];
const EXTRA=Object.freeze({
 [PAYMENT_LANES.SOFTWARE]:[
  "softwareBillingAccountSeparate","subscriptionPlansPublished",
  "subscriptionEntitlementsTested","subscriptionCancellationTested"
 ],
 [PAYMENT_LANES.COMPANY_POS]:[
  "sellerOAuthApproved","sellerTokenEncryptionTested",
  "sellerMerchantLocationMatched","tenantIsolationRetested",
  "customerCheckoutTokenized","independentBackupRestored"
 ]
});
const isId=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{4,100}$/.test(v);

/**
 * Readiness alone must NEVER turn on real money movements.
 * Production API enablement is an independent, explicit, audited release step.
 * Do not include provider secrets in this state object.
 */
export function assessPaymentLane(lane,{checks={},environment="sandbox",merchantId=null,tenantId=null}={}){
 if(!Object.values(PAYMENT_LANES).includes(lane))throw new TypeError("Unknown payment lane");
 if(!["sandbox","disabled","production"].includes(environment))throw new TypeError("Unknown payment environment");
 if(lane===PAYMENT_LANES.COMPANY_POS&&!(typeof tenantId==="string"&&tenantId.trim().length>0))
  throw new TypeError("Authenticated company scope required");
 if(lane===PAYMENT_LANES.SOFTWARE&&tenantId!==null)
  throw new TypeError("Business billing must not inherit a POS company context");
 const required=[...COMMON,...EXTRA[lane]];
 const missing=required.filter(k=>checks[k]!==true);
 return Object.freeze({
  lane,environment,
  merchantIdentityVerified:isId(merchantId)&&checks.merchantAccountVerified===true,
  requiredCount:required.length,passedCount:required.length-missing.length,
  missing:Object.freeze(missing),
  readiness:missing.length===0&&isId(merchantId)?"release_review":"development",
  // Only a future audited production endpoint may decide to enable charges.
  liveChargesEnabled:false,
  subscriptionBillingEnabled:false,
  productionConnected:false
 });
}

/**
 * Prevent use of the software company's credentials to charge a POS customer's
 * account, and prevent a company's POS transaction being re-scoped by the browser.
 * The server MUST derive authenticatedTenantId and merchantId from its session
 * and encrypted provider connection, NEVER from request bodies.
 */
export function assertPaymentTenantBoundary({
 lane,authenticatedTenantId=null,recordTenantId=null,
 nexusMerchantId=null,companyMerchantId=null
}={}){
 if(lane===PAYMENT_LANES.SOFTWARE)
  return recordTenantId===null&&authenticatedTenantId===null&&isId(nexusMerchantId);
 if(lane!==PAYMENT_LANES.COMPANY_POS)return false;
 return typeof authenticatedTenantId==="string"&&authenticatedTenantId.length>0
  &&recordTenantId===authenticatedTenantId
  &&isId(companyMerchantId)&&isId(nexusMerchantId)
  &&companyMerchantId!==nexusMerchantId;
}

// Never collect raw PAN/CVV in custom Nexus UI; tokenize with Square Web Payments SDK.
export function assertTokenizedPaymentOnly(payload){
 if(!payload||typeof payload!=="object"||Array.isArray(payload))return false;
 const forbidden=["card_number","cardNumber","pan","cvv","cvc","security_code",
  "expiry","expiration_date","access_token","refresh_token","merchant_secret"];
 if(forbidden.some(k=>Object.hasOwn(payload,k)))return false;
 return typeof payload.source_id==="string"
  &&payload.source_id.length>=8&&payload.source_id.length<=400
  &&typeof payload.idempotency_key==="string"
  &&/^[A-Za-z0-9_-]{8,45}$/.test(payload.idempotency_key);
}

/**
 * This is the only action mode currently authorized by this foundation.
 * The Square API callers must separately check environment, authentication,
 * payment amount from the database and an explicit authorization flag.
 */
export function paymentExecutionAllowed({environment="disabled",liveChargesEnabled=false}={}){
 return environment==="sandbox"&&liveChargesEnabled===false;
}
