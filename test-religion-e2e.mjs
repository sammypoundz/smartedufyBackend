// E2E test: login as admin, PATCH religion on a student, then read it back
const BASE = 'https://smartedufybackend.onrender.com/api';

async function main() {
  // 1. Login (try goldenlight admin)
  let res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@goldenlight.com', password: 'admin123' }),
  });
  let data = await res.json();
  let token = data.token;
  if (!token) {
    // fallback to seed admin
    res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@school.com', password: 'admin123' }),
    });
    data = await res.json();
    token = data.token;
  }
  if (!token) {
    console.log('LOGIN FAILED', JSON.stringify(data));
    return;
  }
  console.log('Logged in OK, login response:', JSON.stringify(data).slice(0, 400));
  const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-ID': data.user?.schoolId || data.schoolId };
  const tenantId = data.tenantId || data.tenant?.id || data.schoolId;
  if (tenantId) headers['X-Tenant-ID'] = tenantId;

  // 2. Get students
  const students = await fetch(`${BASE}/students`, { headers }).then((r) => r.json());
  console.log('students response type:', Array.isArray(students) ? 'array len ' + students.length : typeof students, JSON.stringify(students).slice(0, 300));
  const target = Array.isArray(students) ? students[0] : null;
  if (!target) return;
  console.log('Target student:', target.name, '| current religion:', target.religion);

  // 3. PATCH religion
  res = await fetch(`${BASE}/students/${target.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ religion: 'Islam' }),
  });
  const patchResult = await res.json();
  console.log('PATCH status:', res.status, '| religion after patch:', patchResult.religion);

  // 4. Re-fetch list and check
  res = await fetch(`${BASE}/students`, { headers: { Authorization: `Bearer ${token}` } });
  const after = (await res.json()).find((s) => s.id === target.id);
  console.log(' religion from GET after patch:', after.religion);
}
main().catch(console.error);
