import test from "node:test";
import assert from "node:assert/strict";
import {
 PAYMENT_LANES,SOFTWARE_DRAFT_PLANS,assessPaymentLane,
 assertPaymentTenantBoundary,assertTokenizedPaymentOnly,paymentExecutionAllowed
} from "../lib/nexus-dual-payment-release.js";

const complete={
 merchantAccountVerified:true,bankPayoutVerified:true,webhookSignatureVerified:true,
 idempotencyAndReconciliationVerified:true,refundAndFailureTested:true,
 privacyTermsApproved:true,taxReviewed:true,ownerAcceptanceApproved:true,
 softwareBillingAccountSeparate:true,subscriptionPlansPublished:true,
 subscriptionEntitlementsTested:true,subscriptionCancellationTested:true,
 sellerOAuthApproved:true,sellerTokenEncryptionTested:true,
 sellerMerchantLocationMatched:true,tenantIsolationRetested:true,
 customerCheckoutTokenized:true,independentBackupRestored:true
};

test("software billing is separate, draft-only, and no production charges can be enabled",()=>{
 assert.deepEqual({...SOFTWARE_DRAFT_PLANS},{
  crm_starter_monthly_draft:4900,crm_growth_monthly_draft:9900,crm_pro_monthly_draft:14900
 });
 const initial=assessPaymentLane(PAYMENT_LANES.SOFTWARE,{merchantId:"NEXUS_MERCHANT",environment:"disabled"});
 assert.equal(initial.readiness,"development");
 assert.equal(initial.liveChargesEnabled,false);
 assert.equal(initial.subscriptionBillingEnabled,false);
 assert.ok(initial.missing.includes("bankPayoutVerified"));
 assert.ok(initial.missing.includes("ownerAcceptanceApproved"));
 const all=assessPaymentLane(PAYMENT_LANES.SOFTWARE,{merchantId:"NEXUS_MERCHANT",environment:"production",checks:complete});
 assert.equal(all.readiness,"release_review");
 assert.equal(all.liveChargesEnabled,false);
 assert.equal(all.subscriptionBillingEnabled,false);
 assert.equal(all.productionConnected,false);
 assert.throws(()=>assessPaymentLane(PAYMENT_LANES.SOFTWARE,{tenantId:"tenant-a"}));
});

test("company POS needs its own merchant approval and authenticated company",()=>{
 assert.throws(()=>assessPaymentLane(PAYMENT_LANES.COMPANY_POS,{}));
 const pending=assessPaymentLane(PAYMENT_LANES.COMPANY_POS,{tenantId:"tenant-a",merchantId:"COMPANY_MERCHANT"});
 assert.ok(pending.missing.includes("sellerOAuthApproved"));
 assert.ok(pending.missing.includes("sellerTokenEncryptionTested"));
 assert.ok(pending.missing.includes("independentBackupRestored"));
 assert.equal(pending.liveChargesEnabled,false);
 const completePos=assessPaymentLane(PAYMENT_LANES.COMPANY_POS,{
  tenantId:"tenant-a",merchantId:"COMPANY_MERCHANT",environment:"production",checks:complete
 });
 assert.equal(completePos.readiness,"release_review");
 assert.equal(completePos.liveChargesEnabled,false);
});

test("business seller funds never get routed to a customer company or vice versa",()=>{
 const ids={nexusMerchantId:"NEXUS_MERCHANT",companyMerchantId:"COMPANY_MERCHANT"};
 assert.equal(assertPaymentTenantBoundary({lane:PAYMENT_LANES.COMPANY_POS,
  authenticatedTenantId:"tenant-a",recordTenantId:"tenant-a",...ids}),true);
 assert.equal(assertPaymentTenantBoundary({lane:PAYMENT_LANES.COMPANY_POS,
  authenticatedTenantId:"tenant-a",recordTenantId:"tenant-b",...ids}),false);
 assert.equal(assertPaymentTenantBoundary({lane:PAYMENT_LANES.COMPANY_POS,
  authenticatedTenantId:"tenant-a",recordTenantId:"tenant-a",
  nexusMerchantId:"SAME",companyMerchantId:"SAME"}),false);
 assert.equal(assertPaymentTenantBoundary({lane:PAYMENT_LANES.SOFTWARE,
  nexusMerchantId:"NEXUS_MERCHANT"}),true);
 assert.equal(assertPaymentTenantBoundary({lane:PAYMENT_LANES.SOFTWARE,
  nexusMerchantId:"NEXUS_MERCHANT",recordTenantId:"tenant-a"}),false);
});

test("reject raw card data and payment tokens disguised as extra form fields",()=>{
 const safe={source_id:"cnon:card-nonce-ok",idempotency_key:"idempotency-ok-123"};
 assert.equal(assertTokenizedPaymentOnly(safe),true);
 for(const [k,val] of Object.entries({
  card_number:"4111111111111111",cardNumber:"4111111111111111",pan:"4111111111111111",
  cvv:"123",cvc:"123",expiry:"12/30",access_token:"secret",refresh_token:"secret"
 })){
  assert.equal(assertTokenizedPaymentOnly({...safe,[k]:val}),false,k);
 }
 assert.equal(assertTokenizedPaymentOnly({...safe,source_id:""}),false);
 assert.equal(assertTokenizedPaymentOnly({...safe,idempotency_key:"x".repeat(46)}),false);
});

test("production/unknown payment environments are never executable",()=>{
 assert.equal(paymentExecutionAllowed({}),false);
 assert.equal(paymentExecutionAllowed({environment:"production"}),false);
 assert.equal(paymentExecutionAllowed({environment:"production",liveChargesEnabled:true}),false);
 assert.equal(paymentExecutionAllowed({environment:"sandbox",liveChargesEnabled:false}),true);
 assert.equal(paymentExecutionAllowed({environment:"sandbox",liveChargesEnabled:true}),false);
});
