#!/usr/bin/env node
/**
 * Nexus CRM+POS isolated HTTP integration runner.
 * ONLY run against a disposable, isolated deployment/database.
 * Required: NEXUS_TEST_BASE_URL, NEXUS_TEST_OPERATOR_EMAIL,
 * NEXUS_TEST_OPERATOR_PASSWORD, NEXUS_TEST_ISOLATED=YES,
 * NEXUS_TEST_ALLOWED_HOST (exact hostname), NEXUS_TEST_RUN_ID.
 * No payment or refund endpoints are called.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw Error(`Missing ${name}`);
  return value;
};
const base = new URL(required("NEXUS_TEST_BASE_URL"));
assert.equal(process.env.NEXUS_TEST_ISOLATED, "YES", "Explicit isolation acknowledgement required");
assert.equal(base.protocol, "https:", "HTTPS required");
assert.equal(base.hostname, required("NEXUS_TEST_ALLOWED_HOST"), "Unexpected test host");
assert.match(base.hostname, /(test|staging|isolated)/i, "Use an isolated hostname, not the live preview");
assert.equal(base.pathname, "/", "Base URL must be origin root");
const runId = required("NEXUS_TEST_RUN_ID").replace(/[^a-z0-9-]/gi, "").slice(0,32);
assert.ok(runId.length >= 6, "Run ID too short");
const operatorEmail = required("NEXUS_TEST_OPERATOR_EMAIL");
const operatorPassword = required("NEXUS_TEST_OPERATOR_PASSWORD");
const suffix = randomBytes(5).toString("hex");
const tests = [];
const record = (name, pass, detail = "") => {
  tests.push({ name, pass: !!pass, ...(detail ? { detail } : {}) });
  if (!pass) throw Error(`${name}: ${detail || "failed"}`);
};
function client() {
  let cookie = "", csrf = "";
  return {
    async call(path, method = "GET", body) {
      assert.match(path, /^\/api\/[a-z0-9/-]+$/i);
      const headers = { Accept: "application/json", Origin: base.origin };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (cookie) headers.Cookie = cookie;
      if (csrf && method !== "GET") headers["X-Nexus-CSRF"] = csrf;
      const res = await fetch(new URL(path, base), {
        method, headers, redirect: "manual",
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const raw = await res.text();
      let data; try { data = JSON.parse(raw); } catch { data = { raw: raw.slice(0, 300) }; }
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      if (data.csrf) csrf = data.csrf;
      return { status: res.status, data };
    }
  };
}
async function main() {
  const op = client();
  let r = await op.call("/api/login", "POST", { email: operatorEmail, password: operatorPassword });
  record("operator_login", r.status === 200 && !r.data.mfaRequired, `HTTP ${r.status}; MFA requires a separately approved test operator`);
  r = await op.call("/api/me");
  record("operator_authorized", r.status === 200 && r.data.user?.isPlatformOperator === true);
  const tenants = [];
  for (const letter of ["a", "b"]) {
    const company = `Nexus Isolation ${runId}-${suffix}-${letter}`;
    const email = `nexus-isolation-${runId}-${suffix}-${letter}@example.test`;
    const password = `Isolated-${randomBytes(24).toString("hex")}!`;
    const invite = await op.call("/api/platform/invitations", "POST", {
      companyName: company, email, deliveryMode: "manual", password: operatorPassword
    });
    record(`invitation_created_${letter}`, invite.status === 201 && !!invite.data.token);
    const person = client();
    const preview = await person.call("/api/invitations/preview", "POST", { token: invite.data.token });
    record(`invitation_preview_${letter}`, preview.status === 200 && preview.data.companyName === company);
    const accept = await person.call("/api/invitations/accept", "POST", { token: invite.data.token, password });
    record(`invitation_redeemed_${letter}`, accept.status === 201 && accept.data.company === company);
    const replay = await client().call("/api/invitations/accept", "POST", { token: invite.data.token, password });
    record(`invitation_replay_denied_${letter}`, replay.status === 403);
    const me = await person.call("/api/me");
    record(`owner_session_${letter}`, me.status === 200 && me.data.user?.role === "owner" && me.data.user?.company === company);
    const fresh = client();
    const login = await fresh.call("/api/login", "POST", { email, password });
    record(`fresh_login_${letter}`, login.status === 200 && !login.data.mfaRequired);
    tenants.push({ company, email, person: fresh });
  }
  const a = tenants[0].person, b = tenants[1].person;
  const created = await a.call("/api/customers", "POST", { name: `Isolation sentinel ${suffix}`, email: "", phone: "", notes: "" });
  record("tenant_a_customer_created", created.status === 201 && !!created.data.id);
  const customerId = created.data.id;
  const listA = await a.call("/api/customers");
  record("tenant_a_sees_own_customer", listA.status === 200 && listA.data.items?.some(x => x.id === customerId));
  const listB = await b.call("/api/customers");
  record("tenant_b_cannot_list_a_customer", listB.status === 200 && !listB.data.items?.some(x => x.id === customerId));
  const editB = await b.call(`/api/customers/${customerId}`, "PATCH", { name: "MUST NOT CHANGE" });
  record("tenant_b_cannot_edit_a_customer", [403, 404].includes(editB.status));
  const listAfter = await a.call("/api/customers");
  record("tenant_a_customer_unchanged", listAfter.data.items?.some(x => x.id === customerId && x.name === `Isolation sentinel ${suffix}`));
  console.log(JSON.stringify({ suite: "nexus-isolated-authenticated-integration", passed: tests.length, total: tests.length, pass: true, tests }, null, 2));
}
main().catch(e => {
  console.error(JSON.stringify({ suite: "nexus-isolated-authenticated-integration", pass: false, tests, error: String(e.message || e) }, null, 2));
  process.exitCode = 1;
});
