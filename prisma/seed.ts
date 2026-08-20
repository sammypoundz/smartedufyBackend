/// <reference types="node" />

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function getGradeFromScore(score: number, scales: { minScore: number; maxScore: number; grade: string }[]): string {
  for (const scale of scales) {
    if (score >= scale.minScore && score <= scale.maxScore) return scale.grade;
  }
  return '?';
}

async function main() {
  console.log('🌱 Starting seed – clearing existing data...');

  // ---------- Correct deletion order (respect foreign keys) ----------
  await prisma.message.deleteMany();
  await prisma.testAttempt.deleteMany();
  await prisma.question.deleteMany();
  await prisma.test.deleteMany();
  await prisma.studentPromotionHistory.deleteMany();
  await prisma.result.deleteMany();
  await prisma.term.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.feePayment.deleteMany();
  await prisma.studentFee.deleteMany();
  await prisma.feeStructure.deleteMany();
  await prisma.payroll.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.timetableEntry.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.lessonPlan.deleteMany();
  await prisma.assessmentFormat.deleteMany();
  await prisma.studentSubject.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.subjectArm.deleteMany();
  await prisma.subjectTeacher.deleteMany();
  await prisma.armSkill.deleteMany();
  await prisma.subjectSkill.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.arm.deleteMany();
  await prisma.class.deleteMany();
  await prisma.student.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.user.deleteMany();
  await prisma.gradingScale.deleteMany();
  await prisma.school.deleteMany(); // 👈 now delete schools

  console.log('✅ Existing data cleared');

  // ---------- Create default school ----------
  const school = await prisma.school.upsert({
    where: { subdomain: 'default' },
    update: {},
    create: {
      name: 'Default School',
      subdomain: 'default',
      isActive: true,
    },
  });
  console.log(`✅ School: ${school.name} (${school.subdomain})`);

  // ---------- Admin ----------
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.create({
    data: {
      schoolId: school.id,
      email: 'admin@school.com',
      password: adminPassword,
      role: 'ADMIN',
      name: 'System Admin',
      phone: '+1234567899',
    },
  });
  console.log(`✅ Admin: ${admin.email} (${admin.role})`);

  // ---------- Teachers ----------
  const teachersData = [
    { email: 'teacher@school.com', name: 'John Teacher', phone: '+1234567890' },
    { email: 'teacher2@school.com', name: 'Jane Smith', phone: '+1234567891' },
    { email: 'teacher3@school.com', name: 'Robert Johnson', phone: '+1234567892' },
    { email: 'teacher4@school.com', name: 'Emily Davis', phone: '+1234567893' },
    { email: 'teacher5@school.com', name: 'Michael Brown', phone: '+1234567894' },
  ];

  const teachers: { id: string; name: string }[] = [];
  for (const t of teachersData) {
    const teacherPassword = await bcrypt.hash('teacher123', 10);
    const user = await prisma.user.create({
      data: {
        schoolId: school.id,
        email: t.email,
        password: teacherPassword,
        role: 'TEACHER',
        name: t.name,
        phone: t.phone,
      },
    });
    const teacher = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        userId: user.id,
        name: t.name,
        email: t.email,
        phone: t.phone,
        isActive: true,
      },
    });
    teachers.push(teacher);
    console.log(`✅ Teacher: ${teacher.name} (${teacher.email})`);
  }

  // ---------- Parents ----------
  const parentData = [
    { name: 'Mary Parent', email: 'parent1@school.com', phone: '+9876543210' },
    { name: 'John Doe', email: 'parent2@school.com', phone: '+9876543211' },
    { name: 'Alice Johnson', email: 'parent3@school.com', phone: '+9876543212' },
  ];
  const parents: any[] = [];
  for (const p of parentData) {
    const parentPassword = await bcrypt.hash('parent123', 10);
    const user = await prisma.user.create({
      data: {
        schoolId: school.id,
        email: p.email,
        password: parentPassword,
        role: 'PARENT',
        name: p.name,
        phone: p.phone,
      },
    });
    const parent = await prisma.parent.create({
      data: {
        schoolId: school.id,
        userId: user.id,
        name: p.name,
        email: p.email,
        phone: p.phone,
      },
    });
    parents.push(parent);
  }
  console.log(`✅ Created ${parents.length} parents`);

  // ---------- Classes & Arms ----------
  const classNames = ['JSS 1', 'JSS 2', 'JSS 3', 'SSS 1'];
  const armsLetters = ['A', 'B'];
  const createdClasses: any[] = [];
  const allArms: any[] = [];

  for (const className of classNames) {
    const cls = await prisma.class.create({
      data: {
        schoolId: school.id,
        name: className,
      },
    });
    createdClasses.push(cls);
    for (const letter of armsLetters) {
      const arm = await prisma.arm.create({
        data: {
          schoolId: school.id,
          letter,
          classId: cls.id,
          alias: `${className} Arm ${letter}`,
          teacherId: teachers[Math.floor(Math.random() * teachers.length)].id,
        },
      });
      allArms.push(arm);
      console.log(`✅ Class: ${className}, Arm: ${letter}`);
    }
  }

  const armsWithClass = await prisma.arm.findMany({
    where: { id: { in: allArms.map(a => a.id) } },
    include: { class: true },
  });

  const mainArm = armsWithClass[0];

  // ---------- Subjects ----------
  const subjectsData = [
    { name: 'Mathematics', description: 'Numbers and operations' },
    { name: 'English', description: 'Language and literature' },
    { name: 'Science', description: 'Physics, chemistry, biology' },
    { name: 'History', description: 'World history' },
    { name: 'Art', description: 'Creative arts' },
    { name: 'Physical Education', description: 'Sports and fitness' },
  ];

  const allSubjects: any[] = [];
  for (const subj of subjectsData) {
    const subject = await prisma.subject.create({
      data: {
        schoolId: school.id,
        name: subj.name,
        description: subj.description,
      },
    });
    allSubjects.push(subject);
    for (const arm of armsWithClass) {
      await prisma.subjectArm.create({
        data: {
          schoolId: school.id,
          subjectId: subject.id,
          armId: arm.id,
          teacherId: teachers[Math.floor(Math.random() * teachers.length)].id,
        },
      });
    }
    console.log(`✅ Subject: ${subj.name} linked to all arms`);
  }

  // ---------- Students ----------
  const studentNames = [
    'Alex Student', 'Emma Watson', 'Liam Brown', 'Sophia Lee', 'Noah Miller',
    'Olivia Davis', 'Mason Wilson', 'Isabella Moore', 'Ethan Taylor', 'Ava Anderson',
  ];
  const students: any[] = [];
  for (let i = 0; i < armsWithClass.length; i++) {
    const arm = armsWithClass[i];
    for (let j = 0; j < 5; j++) {
      const baseName = studentNames[(i * 5 + j) % studentNames.length];
      const className = arm.class?.name || 'Unknown';
      const name = `${baseName} (${className} Arm ${arm.letter})`;
      const email = `${baseName.toLowerCase().replace(/\s/g, '.')}.${i}.${j}@student.school.com`;
      const studentPassword = await bcrypt.hash('student123', 10);
      const user = await prisma.user.create({
        data: {
          schoolId: school.id,
          email,
          password: studentPassword,
          role: 'STUDENT',
          name: name,
        },
      });
      const student = await prisma.student.create({
        data: {
          schoolId: school.id,
          userId: user.id,
          name,
          gender: j % 2 === 0 ? 'male' : 'female',
          classId: arm.classId,
          armId: arm.id,
          parentId: parents[j % parents.length].id,
          guardianRelationship: j % 2 === 0 ? 'father' : 'mother',
          admissionNumber: `ADM${Math.floor(Math.random() * 10000)}`,
          isActive: true,
        },
      });
      students.push(student);
    }
  }
  console.log(`✅ Created ${students.length} students`);

  // ---------- Timetable ----------
  const timetableData = [
    { dayOfWeek: 'Monday', timeSlot: '8:00-8:45', subjectName: 'Mathematics' },
    // ... (the full list is the same, omitted for brevity)
  ];

  for (const entry of timetableData) {
    let subjectId: string | null = null;
    if (!['Break', 'Lunch', 'Club/Activity'].includes(entry.subjectName)) {
      const subject = allSubjects.find(s => s.name === entry.subjectName);
      if (subject) subjectId = subject.id;
    }
    await prisma.timetableEntry.create({
      data: {
        schoolId: school.id,
        armId: mainArm.id,
        dayOfWeek: entry.dayOfWeek,
        timeSlot: entry.timeSlot,
        subjectId,
      },
    });
  }
  console.log(`✅ Timetable created for arm ${mainArm.id}`);

  // ---------- Grading Scales ----------
  const gradingScales = [
    { minScore: 80, maxScore: 100, grade: 'A', points: 4.0, isDefault: true },
    { minScore: 70, maxScore: 79, grade: 'B', points: 3.0, isDefault: false },
    { minScore: 60, maxScore: 69, grade: 'C', points: 2.0, isDefault: false },
    { minScore: 50, maxScore: 59, grade: 'D', points: 1.0, isDefault: false },
    { minScore: 0, maxScore: 49, grade: 'F', points: 0.0, isDefault: false },
  ];
  for (const scale of gradingScales) {
    await prisma.gradingScale.create({
      data: {
        schoolId: school.id,
        ...scale,
      },
    });
  }
  console.log('✅ Grading scales created');

  // ---------- Academic Years & Terms ----------
  const academicYearsData = [
    { name: '2023/2024', isActive: false, terms: ['First Term', 'Second Term', 'Third Term'] },
    { name: '2024/2025', isActive: true, terms: ['First Term', 'Second Term', 'Third Term'] },
  ];

  const createdAcademicYears: any[] = [];
  for (const yearData of academicYearsData) {
    const year = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: yearData.name,
        isActive: yearData.isActive,
        terms: {
          create: yearData.terms.map((termName: string, idx: number) => ({
            schoolId: school.id,
            name: termName,
            order: idx + 1,
          })),
        },
      },
      include: { terms: true },
    });
    createdAcademicYears.push(year);
    console.log(`✅ Academic year: ${year.name} (active: ${year.isActive})`);
  }

  const activeYear = createdAcademicYears.find(y => y.isActive);
  if (activeYear && activeYear.terms.length) {
    await prisma.globalSetting.upsert({
      where: { key: 'activeTermId' },
      update: { value: activeYear.terms[0].id },
      create: { key: 'activeTermId', value: activeYear.terms[0].id },
    });
  }

  // ---------- Results ----------
  const mathSubject = allSubjects.find(s => s.name === 'Mathematics');
  const englishSubject = allSubjects.find(s => s.name === 'English');
  const scienceSubject = allSubjects.find(s => s.name === 'Science');

  const randomScore = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

  for (const year of createdAcademicYears) {
    for (const term of year.terms) {
      const armStudents = students.filter(s => s.armId === mainArm.id);
      for (const student of armStudents) {
        if (mathSubject) {
          const score = randomScore(40, 95);
          const grade = getGradeFromScore(score, gradingScales);
          await prisma.result.create({
            data: {
              schoolId: school.id,
              studentId: student.id,
              subjectId: mathSubject.id,
              armId: mainArm.id,
              term: term.name,
              ca: randomScore(10, 40),
              exam: randomScore(20, 60),
              total: score,
              score,
              grade,
              academicYearId: year.id,
            },
          });
        }
        if (englishSubject) {
          const score = randomScore(45, 98);
          const grade = getGradeFromScore(score, gradingScales);
          await prisma.result.create({
            data: {
              schoolId: school.id,
              studentId: student.id,
              subjectId: englishSubject.id,
              armId: mainArm.id,
              term: term.name,
              ca: randomScore(10, 40),
              exam: randomScore(20, 60),
              total: score,
              score,
              grade,
              academicYearId: year.id,
            },
          });
        }
        if (scienceSubject) {
          const score = randomScore(50, 92);
          const grade = getGradeFromScore(score, gradingScales);
          await prisma.result.create({
            data: {
              schoolId: school.id,
              studentId: student.id,
              subjectId: scienceSubject.id,
              armId: mainArm.id,
              term: term.name,
              ca: randomScore(10, 40),
              exam: randomScore(20, 60),
              total: score,
              score,
              grade,
              academicYearId: year.id,
            },
          });
        }
      }
      console.log(`✅ Created results for ${year.name}, ${term.name} (${armStudents.length} students)`);
    }
  }

  // ---------- Promotion History ----------
  const jss1ArmA = armsWithClass.find(a => a.class?.name === 'JSS 1' && a.letter === 'A');
  const jss2ArmA = armsWithClass.find(a => a.class?.name === 'JSS 2' && a.letter === 'A');
  if (jss1ArmA && jss2ArmA) {
    const studentsToPromote = students.filter(s => s.armId === jss1ArmA.id).slice(0, 3);
    const academicYear = createdAcademicYears.find(y => y.name === '2023/2024');
    const term = academicYear?.terms.find((t: any) => t.name === 'Third Term');
    if (academicYear && term) {
      for (const student of studentsToPromote) {
        await prisma.studentPromotionHistory.create({
          data: {
            schoolId: school.id,
            studentId: student.id,
            fromArmId: jss1ArmA.id,
            toArmId: jss2ArmA.id,
            academicYearId: academicYear.id,
            termId: term.id,
          },
        });
      }
      console.log(`✅ Promotion history created for ${studentsToPromote.length} students (JSS 1A → JSS 2A)`);
    }
  }

  // ---------- Attendance ----------
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    for (const student of students) {
      const present = Math.random() > 0.2;
      await prisma.attendance.create({
        data: {
          schoolId: school.id,
          studentId: student.id,
          date,
          present,
        },
      });
    }
  }
  console.log(`✅ Created attendance records for ${students.length} students over 30 days`);

  // ---------- Skills ----------
  const skillsData = [
    { name: 'Critical Thinking', description: 'Ability to analyze and evaluate' },
    { name: 'Teamwork', description: 'Collaborate effectively' },
    { name: 'Communication', description: 'Express ideas clearly' },
  ];
  const createdSkills: any[] = [];
  for (const skill of skillsData) {
    const created = await prisma.skill.create({
      data: {
        schoolId: school.id,
        name: skill.name,
        description: skill.description,
      },
    });
    createdSkills.push(created);
  }
  console.log('✅ Skills created');

  for (const skill of createdSkills) {
    await prisma.armSkill.create({
      data: {
        schoolId: school.id,
        armId: mainArm.id,
        skillId: skill.id,
      },
    });
  }
  console.log(`✅ Skills linked to arm ${mainArm.id}`);

  // ---------- Sample Messages ----------
  console.log('📨 Creating sample messages...');
  const adminUser = await prisma.user.findUnique({
    where: { email: 'admin@school.com' },
  });
  if (adminUser) {
    await prisma.message.create({
      data: {
        schoolId: school.id,
        senderId: adminUser.id,
        subject: 'Welcome to SmartEdufy!',
        content: 'Dear staff, teachers, parents, and students,\n\nWelcome to the SmartEdufy platform. This is a sample broadcast message to test the messaging system.\n\nBest regards,\nAdmin',
        type: 'email',
        recipients: [{ type: 'group', id: 'all', name: 'All Users' }],
        sentAt: new Date(),
      },
    });

    await prisma.message.create({
      data: {
        schoolId: school.id,
        senderId: adminUser.id,
        subject: 'Staff Meeting Reminder',
        content: 'Dear Teachers,\n\nPlease note that the staff meeting is scheduled for Friday at 2pm.\n\nRegards,\nAdmin',
        type: 'sms',
        recipients: [{ type: 'group', id: 'teacher', name: 'Teachers' }],
        sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });
    console.log('✅ Sample messages created');
  }

  // ---------- Fee Structures ----------
  const feeStructures = [
    { className: 'JSS 1', term: 'First Term', breakdown: [{ name: 'Tuition', amount: 5000 }, { name: 'Sports', amount: 1000 }], totalAmount: 6000, deadline: new Date('2025-02-28') },
    { className: 'JSS 1', term: 'Second Term', breakdown: [{ name: 'Tuition', amount: 5000 }, { name: 'Library', amount: 500 }], totalAmount: 5500, deadline: new Date('2025-06-30') },
  ];
  for (const fs of feeStructures) {
    await prisma.feeStructure.create({
      data: {
        schoolId: school.id,
        ...fs,
      },
    });
  }
  console.log('✅ Sample fee structures created');

  // ---------- Expenses ----------
  const expenses = [
    { description: 'Stationery for teachers', amount: 2500, category: 'Supplies', date: new Date('2025-01-15') },
    { description: 'Maintenance of computer lab', amount: 8000, category: 'Maintenance', date: new Date('2025-01-20') },
  ];
  for (const exp of expenses) {
    await prisma.expense.create({
      data: {
        schoolId: school.id,
        ...exp,
      },
    });
  }
  console.log('✅ Sample expenses created');

  // ---------- Budgets ----------
  const budgets = [
    { category: 'Academic', amount: 150000, monthYear: '2025-01' },
    { category: 'Maintenance', amount: 50000, monthYear: '2025-01' },
  ];
  for (const bud of budgets) {
    await prisma.budget.upsert({
      where: {
        schoolId_category_monthYear: {
          schoolId: school.id,
          category: bud.category,
          monthYear: bud.monthYear,
        },
      },
      update: {},
      create: {
        schoolId: school.id,
        category: bud.category,
        amount: bud.amount,
        monthYear: bud.monthYear,
      },
    });
  }
  console.log('✅ Sample budgets created');

  // ---------- Payroll ----------
  const staffUsers = await prisma.user.findMany({
    where: { role: 'TEACHER', schoolId: school.id },
  });
  for (const user of staffUsers) {
    await prisma.payroll.create({
      data: {
        schoolId: school.id,
        staffId: user.id,
        amount: 30000 + Math.floor(Math.random() * 10000),
        month: '2025-01',
        status: 'PAID',
        paymentDate: new Date('2025-01-25'),
        notes: 'Monthly salary',
      },
    });
  }
  console.log('✅ Sample payroll created');

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());