const BASE = "http://localhost:5000";
(async () => {
  const r = await fetch(BASE + "/api/platform/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "superadmin@smartedufy.com",
      password: "SuperAdmin@2026",
    }),
  });
  const { token } = await r.json();
  const c = await fetch(BASE + "/api/platform/plans", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Diag " + Date.now(),
      type: "STUDENT_BASED",
      perStudentRate: 200,
    }),
  });
  console.log("status:", c.status);
  console.log("body:", await c.text());
})();
