-- Pilot-only Resend self-test throttle: additive, no existing company records changed.
-- At most one outbound connection-test attempt per platform owner per 30 minutes.
-- This does not activate invitation or production email sending.
CREATE TABLE IF NOT EXISTS email_self_test_limits (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 next_allowed_at INTEGER NOT NULL CHECK(next_allowed_at>=0)
);
