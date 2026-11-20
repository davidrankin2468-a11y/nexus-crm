-- Additive onboarding delivery provenance for commercial release gating.
-- Existing pilot invitations remain manually issued; no records deleted.
-- Under REQUIRE_VERIFIED_INVITATION_EMAIL=true, only provider-accepted email
-- invitations may be redeemed; real inbox delivery still needs separate UAT.
ALTER TABLE company_invitations
 ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'manual'
 CHECK(delivery_mode IN ('manual','email'));
ALTER TABLE staff_invitations
 ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'manual'
 CHECK(delivery_mode IN ('manual','email'));
