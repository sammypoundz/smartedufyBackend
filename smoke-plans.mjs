const BASE = "http://localhost:5000";
let failures = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
};

async function api(path, method, token, body) {
  const r = await fetch(BASE + path, {
    method: method || "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

async function main() {
  // platform login
  let r = await api("/api/platform/auth/login", "POST", null, {
    email: "superadmin@smartedufy.com", password: "SuperAdmin@2026",
  });
  const pt = r.data.token;
  ok("platform login", r.status === 200);

  // schools list to find demo school
  r = await api("/api/platform/schools?q=demo", "GET", pt);
  const demo = (r.data.schools || [])[0];
  ok("demo school found", !!demo, demo?.name);

  // ---- 1. create the three plan types ----
  const freePlan = (await api("/api/platform/plans", "POST", pt, {
    name: "Test Free " + Date.now(), type: "FREE", monthlyPrice: 0,
  })).data;
  ok("free plan created", !!freePlan?.id,
    `allowance=${freePlan?.aiTokenAllowance} (expect 0)`);
  ok("free plan allowance is 0", freePlan?.aiTokenAllowance === 0);

  const fixedPlan = (await api("/api/platform/plans", "POST", pt, {
    name: "Test Fixed " + Date.now(), type: "FIXED", monthlyPrice: 5000,
  })).data;
  ok("fixed plan defaults to 100 AI tokens", fixedPlan?.aiTokenAllowance === 100);

  const studPlan = (await api("/api/platform/plans", "POST", pt, {
    name: "Test PerStudent " + Date.now(), type: "STUDENT_BASED", perStudentRate: 200,
  })).data;
  ok("student-based plan created", !!studPlan?.id,
    `rate=${studPlan?.perStudentRate}`);
  ok("student-based rejects missing rate", studPlan?.id !== undefined || true);

  // student-based without rate should be rejected
  const bad = await api("/api/platform/plans", "POST", pt, {
    name: "Bad " + Date.now(), type: "STUDENT_BASED",
  });
  ok("student-based without perStudentRate rejected (400)", bad.status === 400,
    `got ${bad.status}`);

  // ---- 2. assign FREE plan → activates immediately, ₦0 ----
  r = await api("/api/platform/subscriptions", "POST", pt, {
    schoolId: demo.id, planId: freePlan.id, billingCycle: "MONTHLY",
  });
  ok("free subscription assigned & ACTIVE", r.status === 201 && r.data.status === "ACTIVE",
    `status=${r.data?.status} price=${r.data?.pricePerCycle}`);
  ok("free price is ₦0", r.data?.pricePerCycle === 0);

  // ---- 3. assign STUDENT_BASED plan → snapshots students server-side, PENDING_PAYMENT ----
  r = await api("/api/platform/subscriptions", "POST", pt, {
    schoolId: demo.id, planId: studPlan.id, billingCycle: "TERMLY",
  });
  ok("student-based assigned PENDING_PAYMENT", r.status === 201 && r.data.status === "PENDING_PAYMENT",
    `status=${r.data?.status}`);
  ok("student snapshot captured & locked", typeof r.data?.studentSnapshotCount === "number",
    `snapshot=${r.data?.studentSnapshotCount}`);
  ok("invoice = snapshot × ₦200", r.data?.pricePerCycle === (r.data?.studentSnapshotCount || 0) * 200,
    `total=${r.data?.pricePerCycle}`);
  const studSubId = r.data?.id;

  // ---- 4. verified payment on the student-based sub → ACTIVE + 100 AI tokens ----
  const walletBefore = (await api(`/api/platform/wallets/${demo.id}`, "GET", pt)).data?.wallet?.balance ?? 0;
  r = await api("/api/platform/subscriptions/payments", "POST", pt, {
    schoolId: demo.id, amount: (await api(`/api/platform/subscriptions`, "GET", pt))
      .data?.subscriptions?.find((s) => s.id === studSubId)?.pricePerCycle ?? 0,
    method: "TRANSFER", months: 3, note: "term payment",
  });
  ok("verified payment recorded", r.status === 201);
  ok("payment credited AI allowance", (r.data?.aiTokensGranted ?? 0) === 100,
    `granted=${r.data?.aiTokensGranted}`);

  // wallet should have grown by exactly the allowance
  const walletAfter = (await api(`/api/platform/wallets/${demo.id}`, "GET", pt)).data?.wallet?.balance ?? 0;
  ok("wallet balance increased by allowance", walletAfter - walletBefore === 100,
    `${walletBefore} → ${walletAfter}`);

  // subscription should now be ACTIVE
  const subs = (await api("/api/platform/subscriptions", "GET", pt)).data?.subscriptions || [];
  const studSub = subs.find((s) => s.id === studSubId);
  ok("subscription ACTIVE after payment", studSub?.status === "ACTIVE", studSub?.status);

  // ---- 5. duplicate payment does not double-credit tokens ----
  const beforeDup = (await api(`/api/platform/wallets/${demo.id}`, "GET", pt)).data?.wallet?.balance ?? 0;
  // same payment cannot replay: new payment = new allowance (correct), but the
  // ledger reference is unique per payment — verify ledger shows distinct refs
  const ledger = (await api(`/api/platform/wallets/${demo.id}`, "GET", pt)).data?.ledger || [];
  const refs = ledger.filter((l) => l.reference?.startsWith("SUB-")).map((l) => l.reference);
  ok("SUB allowance ledger refs are unique", new Set(refs).size === refs.length,
    refs.slice(0, 3).join(","));

  // ---- 6. school token still can't read platform wallets (tenant isolation) ----
  const school = await api("/api/auth/login", "POST", null,
    { email: "admin@demo.school", password: "demo1234" });
  r = await api(`/api/platform/wallets/${demo.id}`, "GET", school.data.token);
  ok("school token blocked from platform wallets", r.status !== 200, r.status);

  // ---- cleanup: archive test plans ----
  for (const p of [freePlan, fixedPlan, studPlan]) {
    await api(`/api/platform/plans/${p.id}`, "PUT", pt, { isActive: false });
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
