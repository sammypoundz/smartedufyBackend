const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const schoolId = '6a8b2777e65bf8739c376393';
  // Remove my debug/test students and their users
  const dbg = await p.student.findMany({ where: { schoolId, name: { in: ['Debug Test', 'API Debug Student'] } } });
  for (const s of dbg) { await p.student.delete({ where: { id: s.id } }); await p.user.delete({ where: { id: s.userId } }); }
  console.log('Debug students removed:', dbg.length);
  // Delete STUDENT users that have no student profile (orphans from previous uploads)
  const studentUsers = await p.user.findMany({ where: { role: 'STUDENT', schoolId }, select: { id: true } });
  const withProfile = await p.student.findMany({ where: { schoolId }, select: { userId: true } });
  const linked = new Set(withProfile.map(s => s.userId));
  const orphans = studentUsers.filter(u => !linked.has(u.id));
  for (const u of orphans) { await p.user.delete({ where: { id: u.id } }); }
  console.log('Orphaned student users deleted:', orphans.length);
  console.log('Students remaining:', await p.student.count({ where: { schoolId } }));
  console.log('STUDENT users remaining:', await p.user.count({ where: { role: 'STUDENT', schoolId } }));
  await p.$disconnect();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
