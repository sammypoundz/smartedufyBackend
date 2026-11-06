// Repro: login as the Newbreed admin, walk the onboarding stages and log
// every response to see which ones fail to persist.
const BASE = "http://localhost:5000/api";
const EMAIL = process.argv[2] || "admin@school.com";
const PASSWORD = process.argv[3] || "admin123";

async function main() {
  const login = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await login.json();
  if (!data.token) {
    console.log("LOGIN FAILED:", JSON.stringify(data).slice(0, 300));
    return;
  }
  const token = data.token;
  const tenantId = data.user?.schoolId || data.schoolId;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-Tenant-ID": tenantId,
  };
  console.log("Logged in as", data.user?.email, "school", tenantId);

  // 1. Read progress
  const p0 = await fetch(`${BASE}/onboarding/progress`, { headers });
  console.log("GET progress:", p0.status);

  // 2. Complete PROFILE
  const p1 = await fetch(`${BASE}/onboarding/progress/PROFILE/complete`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Persist Check " + Date.now() }),
  });
  console.log("PROFILE complete:", p1.status, JSON.stringify(await p1.json()).slice(0, 200));

  // 3. Academic
  const p2 = await fetch(`${BASE}/onboarding/academic`, {
    method: "POST",
    headers,
    body: JSON.stringify({ yearName: "2025/2026", termNames: ["First Term", "Second Term", "Third Term"] }),
  });
  console.log("ACADEMIC:", p2.status, JSON.stringify(await p2.json()).slice(0, 200));

  const p2b = await fetch(`${BASE}/onboarding/progress/ACADEMIC/complete`, {
    method: "POST", headers, body: JSON.stringify({}),
  });
  console.log("ACADEMIC complete:", p2b.status);

  // 4. Classes
  const p3 = await fetch(`${BASE}/onboarding/classes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ names: ["Repro Class " + Date.now()] }),
  });
  console.log("CLASSES:", p3.status, JSON.stringify(await p3.json()).slice(0, 200));

  const p3b = await fetch(`${BASE}/onboarding/progress/CLASSES/complete`, {
    method: "POST", headers, body: JSON.stringify({}),
  });
  console.log("CLASSES complete:", p3b.status);

  // 5. Subjects
  const p4 = await fetch(`${BASE}/onboarding/subjects`, {
    method: "POST",
    headers,
    body: JSON.stringify({ names: ["Repro Subject " + Date.now()] }),
  });
  console.log("SUBJECTS:", p4.status, JSON.stringify(await p4.json()).slice(0, 200));

  const p4b = await fetch(`${BASE}/onboarding/progress/SUBJECTS/complete`, {
    method: "POST", headers, body: JSON.stringify({}),
  });
  console.log("SUBJECTS complete:", p4b.status);

  // 6. Verify what actually landed in the DB
  const pf = await fetch(`${BASE}/onboarding/progress`, { headers });
  const pfj = await pf.json();
  console.log("FINAL completedStages:", JSON.stringify(pfj.progress?.completedStages));
  console.log("FINAL counts:", JSON.stringify(pfj.snapshot?.counts));
}
main().catch((e) => console.error("REPRO ERROR:", e.message));
