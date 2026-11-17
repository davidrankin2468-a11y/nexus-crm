# Nexus CRM — Sales Launch Kit (draft, November 16, 2026)

**Product owner:** Nexus Software Solutions (proposed business identity — confirm registration, domain and business contact details before accepting payments).

**Public product site:** https://nexus-crm-showcase.pages.dev

**Interactive fictional-data demo:** https://nexus-crm-preview.pages.dev

**Private cloud alpha (not public self-sign-up):** https://nexus-crm-secure.pages.dev

## 1. Clear product pitch

> Nexus CRM brings customers, jobs, crew scheduling, estimates, invoices, and business activity together in five focused workspaces. It is being designed for landscaping, painting, construction, and other field-service companies that want straightforward workflows without juggling disconnected tools.

**Five core tabs:** Dashboard, Customers, Operations, Finance, Management.

**What works today:** A real browser demo anyone can explore with fictional records, plus a separate secure-owner cloud alpha with database-backed customers, jobs, employees, appointments, estimates, invoices, recorded payments and recovery controls. **Do not claim:** native offline sync, automatic billing, card processing, multi-user company accounts, self-service onboarding, MFA, or production-certified security.

## 2. Suggested commercial positioning (not approved public prices)

The market includes products with mature booking, payments, integrations and support, so Nexus should launch with a controlled, value-focused pilot and price only for features that work.

**Starting price hypotheses to validate with prospects—not published prices:**

| Proposed future plan | Target | Test price | Conditions before offering |
| --- | --- | --- | --- |
| Starter | Solo operator / one owner | $49 per company/month | Secure tenant sign-up, backup/export, validated legal invoices, help documentation |
| Team | Small crews | $99 per company/month, includes up to five users | Employee login, granular roles, invitations, notifications, audit, tenant security tests |
| Business | Larger service team | $199 per company/month, includes up to 15 users | Team onboarding, reliable offline sync (if advertised), expanded reporting, support capacity |
| Custom | Tailored implementation | Project quote, potentially $500–$3,000+ one-time plus subscription | Signed statement of work, requirements, ownership and support terms |

**Optional early-adopter approach:** Offer a *free, controlled pilot with fictional records* while security remains in alpha; later offer a separately negotiated discounted pilot only after production-readiness gates pass. Do not invoice or collect customer production data while the service is not approved for production.

**Competitor context:** Jobber's official price page lists a Core plan with a one-user monthly price and substantially higher tiers; Housecall Pro lists Basic and Essentials tiers; Contractor Foreman lists multiple construction packages. These products have extensive commercial features that Nexus does not yet match. Verify pricing and included features on the current vendor pages before publishing comparisons:
- https://www.getjobber.com/pricing/
- https://www.housecallpro.com/pricing/
- https://contractorforeman.com/plans-monthly/

All price suggestions above are commercial hypotheses, **not implemented billing plans or offers**.

## 3. Three-step prospect-to-customer process

1. **Discover.** Share only the public product site with a business owner. They can click through to the fictional-data demo without an account. Do **not** share the private secure-alpha login or owner's credentials.
2. **Qualify.** Ask them to submit the early-access form. You can view requests from **secure Nexus CRM → Management → Sales Leads** and manually mark them New, Contacted, or Closed.
3. **Pilot.** Schedule a conversation, record requirements, show the public demo, and verify essential gaps. Admit only authorized test participants to a separate, security-reviewed tenant when secure onboarding exists. A request is not a paid subscription.

## 4. Demo walkthrough for prospects (10–15 minutes)

- 0–2 min: Ask what trade they are in, how many jobs they manage, and what tools they use.
- 2–4 min: Dashboard: job counts, customers, outstanding amounts.
- 4–6 min: Customers: contact profiles and related jobs.
- 6–9 min: Operations: job creation, scheduling, employee assignment.
- 9–12 min: Finance: estimate → accepted → invoice; record an external payment; report balance.
- 12–15 min: Management: show recovery concepts; clarify current alpha limitations; invite feedback.

**Three feedback questions:** What did you find easiest? What critical feature is missing? What would make you willing to pay for it?

## 5. Outreach messages

### Short introduction
Subject: A simpler CRM for your service business

Hi,

I'm developing Nexus CRM through Nexus Software Solutions for landscaping, painting, construction and other field-service teams. It brings customer records, jobs, scheduling and estimates/invoices together in one workspace.

There is an interactive demo you can try without installing anything: https://nexus-crm-preview.pages.dev

I'd value your feedback on whether the workflow would help your team. The product is currently in pre-launch development and is not taking paid accounts yet.

Thank you,
Nexus Software Solutions

### Follow-up
Hi,

I wanted to follow up on the Nexus CRM demo. If you had a chance to look at it, what would need to change to make it useful for your business?

The product overview and early-access form are here: https://nexus-crm-showcase.pages.dev

Thanks,
Nexus Software Solutions

**Do not send unsolicited bulk messages, imply existing customers, or make unsupported claims about security, compliance, uptime or integrations.** Review applicable marketing/email laws before campaign automation.

## 6. Commercial release gates — ALL must pass before paid onboarding

- [ ] Register/verify business identity, business email/domain and support contact; confirm intellectual property rights and licensing model.
- [ ] Legal review of customer contract, privacy policy, data processing and cancellation/refund policy; clarify taxes.
- [ ] Secure multi-company provisioning with tenant isolation across every endpoint and integration; independent penetration/security review.
- [ ] Invitation-based or verified-email self-service signup; MFA, password recovery, administrative account ownership transfer.
- [ ] Granular user roles, employee onboarding and permissions; rate limits and anti-automation protections.
- [ ] Independent encrypted backups outside the production D1 database, retention tests and real restore drills.
- [ ] Customer-facing data export, deletion, retention rules and GDPR/CCPA handling where applicable.
- [ ] Accurate, legally usable estimates and invoices; taxes, numbering and template configuration; manual payment controls.
- [ ] Subscription and licensing engine: server-verified plan limits, billing lifecycle, invoices, failed payments, trials, cancellation, refund and access-policy transitions.
- [ ] Payment processor connected using hosted checkout; never store full card details yourself.
- [ ] Mobile accessibility and end-to-end regression testing, concurrency/race checks and monitoring/incident response.
- [ ] No promises of offline synchronization until a real offline queue, conflict resolution and device-sync tests pass.
- [ ] Written onboarding docs, support channels and service expectations.

## 7. Public communication rules

**Okay to say now:** Interactive demo available; software designed for field-service businesses; product in pre-launch; early-access inquiries open; browser-based; core CRM workflows illustrated.

**Do not claim yet:** Ready to buy; customer data fully protected; unlimited users; offline capable; payments processed; QuickBooks integration; guaranteed uptime; professionally audited security; vendor certifications; customers/revenue you have not actually earned.

## 8. Weekly owner review

- Open Management → Sales Leads; categorize New / Contacted / Closed.
- Respond personally to consenting inquirers from your own email client.
- Record requested features and pattern of recurring industry needs.
- Review demo feedback, security issues, and deployment tests.
- Revisit pricing only when readiness and customer demand support it.

**Important:** The public inquiry database and production CRM company database are deliberately separate. Do not copy contact lists into public GitHub files.
