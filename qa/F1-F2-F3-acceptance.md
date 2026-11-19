# F1 / F2 acceptance and regression checks (Vercel CRM preview)

Source: the five-page staging report supplied for the *Cloudflare* host. The Vercel preview is a different implementation. Do not report the Cloudflare F1 finding as fixed by testing this repository alone.

## F1 — job-save request scope

- [ ] On the original Cloudflare build, instrument owner and operator job saves, including API request URLs, statuses and durations. Baselines in report: 16 follow-up reads (owner), 19 (operator).
- [ ] Replace broad refresh with the saved job and affected totals only. Assert no backup, invitation, security-activity, MFA or unrelated management reads.
- [ ] Verify job and dashboard totals after reload, with request counts and elapsed time.
- [x] Vercel browser-only demo source inspection: job saves update local `db.jobs`, persist once in browser localStorage and render the active view. No post-save network refresh is present. This is **not** evidence of a Cloudflare F1 fix or an authenticated server-side test.

## F2 — write success versus refresh failure

- [x] Vercel CRM preview: `persist()` catches localStorage write failure and `complete()` restores `lastSavedSnapshot` when write fails. Source-reviewed, not browser fault-injection certified.
- [x] Secure POS checkout: after a confirmed server write, a failed list refresh displays success with a refresh warning, rather than prompting a new checkout. Source-reviewed, not authenticated browser certified.
- [ ] Browser fault injection: force post-write GET to fail, verify exactly one stored sale, success message and refresh-only recovery.
- [ ] Browser fault injection: force localStorage quota error, verify no phantom saved job and unchanged persisted record count.
- [ ] Retry ambiguous checkout with the same idempotency key; assert only one sale and stock decrement.

## F3 — release/security verification

- [x] SQL impersonation tests for fictional companies A and B: each can see its own company and cannot read the other (2026-11-19).
- [x] Public server-only tables have RLS enabled and no ordinary anon/authenticated SELECT/INSERT privileges (2026-11-19). Do not add permissive policies just to silence informational advisor notices.
- [x] POS DB functions are not executable by anon/authenticated roles; service role can execute them (2026-11-19).
- [ ] Enable Supabase Auth leaked-password protection (requires project Auth settings access).
- [ ] Test owner/employee role separation, MFA enrollment/recovery and session revocation through authenticated browser flows.
- [ ] Restore fictional linked records into isolated destination and verify record counts and recovery time.
- [ ] Run authenticated app/API latency and data-integrity tests; record revision, URLs, p50/p95, failures and stop conditions.

## Release gate

Do not mark all tests passed or promote to production until every unchecked item has reproducible evidence. Deploy a preview only after the intended fixes are committed and identify the exact SHA tested.
