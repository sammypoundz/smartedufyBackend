// src/controllers/libraryController.ts
// Library management: books, lending (issuing/returning), per-class book fees,
// who has paid/who owes, and pushing paid book fees into the school fees system.
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { getCurrentTenantId } from "../utils/tenantContext";
import { AuthRequest } from "../middleware/auth";

// Express query values can be string | string[] | undefined.
const qs = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

// ---------- Validation schemas ----------
export const createBookSchema = z.object({
  title: z.string().min(1),
  author: z.string().optional(),
  isbn: z.string().optional(),
  category: z.string().optional(),
  price: z.coerce.number().min(0).default(0),
  totalCopies: z.coerce.number().int().min(0).default(0),
});

export const updateBookSchema = createBookSchema.partial();

export const issueBookSchema = z.object({
  bookId: z.string().min(1),
  studentId: z.string().min(1),
  dueDate: z.coerce.date(),
  notes: z.string().optional(),
});

export const assignBookFeeSchema = z.object({
  bookId: z.string().min(1),
  classId: z.string().min(1),
  amount: z.coerce.number().min(0).optional(), // defaults to book price
});

export const pushToFeesSchema = z.object({
  bookId: z.string().min(1),
  feeStructureId: z.string().min(1),
  onlyPaid: z.coerce.boolean().default(true),
});

const iso = (d: Date) => d.toISOString();

export const libraryController = {
  // ================= BOOKS =================
  // GET /api/library/books?search=&page=&limit=
  getBooks: async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = getCurrentTenantId();
      if (!tenantId)
        return res.status(403).json({ error: "Tenant context missing" });
      const search = qs(req.query.search) || "";
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
      const where: any = { schoolId: tenantId };
      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { author: { contains: search, mode: "insensitive" } },
          { isbn: { contains: search, mode: "insensitive" } },
        ];
      }
      const [data, total] = await Promise.all([
        prisma.book.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.book.count({ where }),
      ]);
      res.json({
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (err) {
      console.error("[library.getBooks]", err);
      res.status(500).json({ error: "Failed to fetch books" });
    }
  },

  // POST /api/library/books
  createBook: async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = getCurrentTenantId();
      if (!tenantId)
        return res.status(403).json({ error: "Tenant context missing" });
      const data = createBookSchema.parse(req.body);
      const book = await prisma.book.create({
        data: {
          ...data,
          schoolId: tenantId,
          availableCopies: data.totalCopies,
        },
      });
      res.status(201).json(book);
    } catch (err: any) {
      if (err.name === "ZodError")
        return res.status(400).json({ error: err.errors });
      console.error("[library.createBook]", err);
      res.status(500).json({ error: "Failed to create book" });
    }
  },

  // PUT /api/library/books/:id
  updateBook: async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = getCurrentTenantId();
      if (!tenantId)
        return res.status(403).json({ error: "Tenant context missing" });
      const data = updateBookSchema.parse(req.body);
      const existing = await prisma.book.findUnique({
        where: { id: qs(req.params.id) },
      });
      if (!existing || existing.schoolId !== tenantId) {
        return res.status(404).json({ error: "Book not found" });
      }
      // Adjust availability when totalCopies changes.
      let availableCopies = existing.availableCopies;
      if (data.totalCopies !== undefined) {
        const onLoan = existing.totalCopies - existing.availableCopies;
        availableCopies = Math.max(0, data.totalCopies - onLoan);
      }
      const book = await prisma.book.update({
        where: { id: qs(req.params.id) },
        data: { ...data, availableCopies },
      });
      res.json(book);
    } catch (err: any) {
      if (err.name === "ZodError")
        return res.status(400).json({ error: err.errors });
      console.error("[library.updateBook]", err);
      res.status(500).json({ error: "Failed to update book" });
    }
  },

  // DELETE /api/library/books/:id
  deleteBook: async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = getCurrentTenantId();
      if (!tenantId)
        return res.status(403).json({ error: "Tenant context missing" });
      const book = await prisma.book.findUnique({
        where: { id: qs(req.params.id) },
      });
      if (!book || book.schoolId !== tenantId) {
        return res.status(404).json({ error: "Book not found" });
      }
      const activeLoans = await prisma.bookLoan.count({
        where: { bookId: qs(req.params.id), status: "ON_LOAN" },
      });
      if (activeLoans > 0) {
        return res
          .status(400)
          .json({
            error: `Cannot delete: ${activeLoans} copy/copies still on loan`,
          });
      }
      await prisma.bookLoan.deleteMany({ where: { bookId: qs(req.params.id) } });
      await prisma.bookFee.deleteMany({ where: { bookId: qs(req.params.id) } });
      await prisma.book.delete({ where: { id: qs(req.params.id) } });
      res.status(204).send();
    } catch (err) {
      console.error("[library.deleteBook]", err);
      res.status(500).json({ error: "Failed to delete book" });
    }
  },

  // ================= LENDING =================
  // GET /api/library/loans?status=ON_LOAN|RETURNED|OVERDUE&classId=&studentId=
  getLoans: async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = getCurrentTenantId();
      if (!tenantId)
        return res.status(403).json({ error: "Tenant context missing" });
      const { status, classId, studentId } = req.query as Record<
        string,
        string
      >;
      const where: any = { schoolId: tenantId };
      if (status === "OVERDUE") {
        where.status = "ON_LOAN";
        where.dueDate = { lt: new Date() };
      } else if (status) {
        where.status = status;
      }
      if (studentId) where.studentId = studentId;
      if (classId) where.student = { classId };
      const loans = await prisma.bookLoan.findMany({
        where,
        orderBy: { issuedAt: "desc" },
        take: 500,
        include: {
          book: { select: { title: true, author: true, category: true } },
          student: {
            select: {
              name: true,
              admissionNumber: true,
              studentCode: true,
              classId: true,
              class: { select: { name: true } },
            },
          },
        },
      });
      res.json(loans);
    } catch (err) {
      console.error("[library.getLoans]", err);
      res.status(500).json({ error: "Failed to fetch loans" });
    }
  },

  // POST /api/library/loans — issue a book
  issueBook: async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = getCurrentTenantId();
      if (!tenantId)
        return res.status(403).json({ error: "Tenant context missing" });
      const data = issueBookSchema.parse(req.body);
      const book = await prisma.book.findUnique({ where: { id: data.bookId } });
      if (!book || book.schoolId !== tenantId) {
        return res.status(404).json({ error: "Book not found" });
      }
      if (book.availableCopies <= 0) {
        return res
          .status(400)
          .json({ error: "No copies available for this book" });
      }
      const student = await prisma.student.findUnique({
        where: { id: data.studentId },
      });
      if (!student || student.schoolId !== tenantId) {
        return res.status(404).json({ error: "Student not found" });
      }
      const [loan] = await prisma.$transaction([
        prisma.bookLoan.create({
          data: {
            schoolId: tenantId,
            bookId: data.bookId,
            studentId: data.studentId,
            dueDate: data.dueDate,
            notes: data.notes || null,
          },
          include: {
            book: { select: { title: true, author: true } },
            student: { select: { name: true, admissionNumber: true } },
          },
        }),
        prisma.book.update({
          where: { id: data.bookId },
          data: { availableCopies: { decrement: 1 } },
        }),
      ]);
      res.status(201).json(loan);
    } catch (err: any) {
      if (err.name === "ZodError")
        return res.status(400).json({ error: err.errors });
      console.error("[library.issueBook]", err);
      res.status(500).json({ error: "Failed to issue book" });
    }
  },

  // PUT /api/library/loans/:id/return — mark a loan returned
  returnBook: async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = getCurrentTenantId();
      if (!tenantId)
        return res.status(403).json({ error: "Tenant context missing" });
      const loan = await prisma.bookLoan.findUnique({
        where: { id: qs(req.params.id) },
      });
      if (!loan || loan.schoolId !== tenantId) {
        return res.status(404).json({ error: "Loan not found" });
      }
      if (loan.status === "RETURNED") {
        return res.status(400).json({ error: "Book already returned" });
      }
      const updated = await prisma.$transaction([
        prisma.bookLoan.update({
          where: { id: qs(req.params.id) },
          data: { status: "RETURNED", returnedAt: new Date() },
        }),
        prisma.book.update({
          where: { id: loan.bookId },
          data: { availableCopies: { increment: 1 } },
        }),
      ]);
      res.json(updated[0]);
    } catch (err) {
      console.error("[library.returnBook]", err);
      res.status(500).json({ error: "Failed to return book" });
    }
  },

  // ================= BOOK FEES =================
  // GET /api/library/book-fees?classId=&paid=&bookId=
  // Returns per-student book fee status, optionally filtered by class.
  getBookFees: async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = getCurrentTenantId();
      if (!tenantId)
        return res.status(403).json({ error: "Tenant context missing" });
      const { classId, paid, bookId } = { classId: qs(req.query.classId), paid: qs(req.query.paid), bookId: qs(req.query.bookId) };
      const where: any = { schoolId: tenantId };
      if (bookId) where.bookId = bookId;
      if (paid === "true") where.paid = true;
      if (paid === "false") where.paid = false;
      if (classId) where.student = { classId };
      const fees = await prisma.bookFee.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 500,
        include: {
          book: { select: { title: true, author: true, price: true } },
          student: {
            select: {
              name: true,
              admissionNumber: true,
              studentCode: true,
              classId: true,
              class: { select: { name: true } },
            },
          },
        },
      });
      res.json(fees);
    } catch (err) {
      console.error("[library.getBookFees]", err);
      res.status(500).json({ error: "Failed to fetch book fees" });
    }
  },

  // POST /api/library/book-fees/assign — assign a book fee to a whole class
  assignBookFeeToClass: async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = getCurrentTenantId();
      if (!tenantId)
        return res.status(403).json({ error: "Tenant context missing" });
      const data = assignBookFeeSchema.parse(req.body);
      const book = await prisma.book.findUnique({ where: { id: data.bookId } });
      if (!book || book.schoolId !== tenantId) {
        return res.status(404).json({ error: "Book not found" });
      }
      const students = await prisma.student.findMany({
        where: { schoolId: tenantId, classId: data.classId, isActive: true },
        select: { id: true },
      });
      const amount = data.amount ?? book.price;
      const created = await Promise.all(
        students.map((s) =>
          prisma.bookFee.upsert({
            where: { studentId_bookId: { studentId: s.id, bookId: book.id } },
            create: {
              schoolId: tenantId,
              bookId: book.id,
              studentId: s.id,
              amount,
            },
            update: { amount },
          }),
        ),
      );
      res.status(201).json({ assigned: created.length, amount });
    } catch (err: any) {
      if (err.name === "ZodError")
        return res.status(400).json({ error: err.errors });
      console.error("[library.assignBookFeeToClass]", err);
      res.status(500).json({ error: "Failed to assign book fees" });
    }
  },

  // PUT /api/library/book-fees/:id — mark a single charge paid/unpaid
  setBookFeePaid: async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = getCurrentTenantId();
      if (!tenantId)
        return res.status(403).json({ error: "Tenant context missing" });
      const fee = await prisma.bookFee.findUnique({
        where: { id: qs(req.params.id) },
      });
      if (!fee || fee.schoolId !== tenantId) {
        return res.status(404).json({ error: "Book fee not found" });
      }
      const paid = req.body?.paid === true;
      const updated = await prisma.bookFee.update({
        where: { id: qs(req.params.id) },
        data: { paid, paidAt: paid ? new Date() : null },
        include: {
          book: { select: { title: true } },
          student: { select: { name: true } },
        },
      });
      res.json(updated);
    } catch (err) {
      console.error("[library.setBookFeePaid]", err);
      res.status(500).json({ error: "Failed to update book fee" });
    }
  },

  // POST /api/library/book-fees/push-to-school-fees
  // Pushes book charges into the school fees system (StudentFee + FeePayment)
  // so they appear on the student's fee account. Idempotent per charge via
  // pushedToFeesAt — a charge can never be pushed twice.
  pushBookFeesToSchoolFees: async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = getCurrentTenantId();
      if (!tenantId)
        return res.status(403).json({ error: "Tenant context missing" });
      const data = pushToFeesSchema.parse(req.body);

      const book = await prisma.book.findUnique({ where: { id: data.bookId } });
      if (!book || book.schoolId !== tenantId) {
        return res.status(404).json({ error: "Book not found" });
      }
      const feeStructure = await prisma.feeStructure.findUnique({
        where: { id: data.feeStructureId },
      });
      if (!feeStructure || feeStructure.schoolId !== tenantId) {
        return res.status(404).json({ error: "Fee structure not found" });
      }

      const charges = await prisma.bookFee.findMany({
        where: {
          schoolId: tenantId,
          bookId: data.bookId,
          pushedToFeesAt: null,
          ...(data.onlyPaid ? { paid: true } : {}),
        },
        include: { student: { select: { name: true } } },
      });
      if (!charges.length) {
        return res.json({
          pushed: 0,
          message: "No unpushed charges match the filter",
        });
      }

      // Make the book charge visible on the Fees page: append a
      // `Book: <title>` item to the fee structure's per-student breakdown
      // (idempotent) and recompute the class-wide totalAmount the same way
      // feeService does (per-student sum × active student count).
      const bookItemName = `Book: ${book.title}`;
      const breakdown = Array.isArray(feeStructure.breakdown)
        ? ([...((feeStructure.breakdown as any[]) || [])] as {
            name: string;
            amount: number;
          }[])
        : [];
      if (!breakdown.some((i) => i.name === bookItemName)) {
        const sampleAmount = charges[0]?.amount ?? 0;
        breakdown.push({ name: bookItemName, amount: sampleAmount });
        const perStudentAmount = breakdown.reduce((s, i) => s + (i.amount || 0), 0);
        const studentCount = await prisma.student.count({
          where: {
            schoolId: tenantId,
            isActive: true,
            class: { name: feeStructure.className },
          },
        });
        await prisma.feeStructure.update({
          where: { id: feeStructure.id },
          data: {
            breakdown: breakdown as any,
            totalAmount: perStudentAmount * studentCount,
          },
        });
      }

      let pushed = 0;
      const errors: string[] = [];
      for (const charge of charges) {
        try {
          // Reuse the school fee payment flow: record a payment for the
          // student against the chosen fee structure (books are charged as
          // an item on the fee account).
          await prisma.studentFee.upsert({
            where: {
              studentId_feeStructureId: {
                studentId: charge.studentId,
                feeStructureId: data.feeStructureId,
              },
            },
            create: {
              schoolId: tenantId,
              studentId: charge.studentId,
              feeStructureId: data.feeStructureId,
              amountAssigned: charge.amount,
              amountPaid: charge.paid ? charge.amount : 0,
              status: charge.paid ? "PAID" : "PENDING",
            },
            update: {
              amountPaid: { increment: charge.paid ? charge.amount : 0 },
            },
          });
          if (charge.paid) {
            // Sync the PAID/PARTIAL status after the increment.
            const sf = await prisma.studentFee.findUnique({
              where: {
                studentId_feeStructureId: {
                  studentId: charge.studentId,
                  feeStructureId: data.feeStructureId,
                },
              },
            });
            if (sf) {
              const status =
                sf.amountPaid >= sf.amountAssigned
                  ? "PAID"
                  : sf.amountPaid > 0
                    ? "PARTIAL"
                    : "PENDING";
              await prisma.studentFee.update({
                where: { id: sf.id },
                data: { status },
              });
            }
            await prisma.feePayment.create({
              data: {
                schoolId: tenantId,
                studentId: charge.studentId,
                feeStructureId: data.feeStructureId,
                amountPaid: charge.amount,
                paymentDate: new Date(),
                paymentMethod: "BOOK_FEE",
                reference: `BOOK-${charge.bookId.slice(-6)}`,
                // Key must be `itemName` — the Fees page (getItemOwedAmounts)
                // and feeService.recordPayment both read item.itemName.
                breakdownItems: [
                  { itemName: bookItemName, amount: charge.amount },
                ] as any,
                status: "PAID",
              },
            });
          }
          await prisma.bookFee.update({
            where: { id: charge.id },
            data: { pushedToFeesAt: new Date() },
          });
          pushed += 1;
        } catch (e: any) {
          errors.push(
            `${charge.student?.name || charge.studentId}: ${e.message}`,
          );
        }
      }
      res.json({ pushed, errors });
    } catch (err: any) {
      if (err.name === "ZodError")
        return res.status(400).json({ error: err.errors });
      console.error("[library.pushBookFeesToSchoolFees]", err);
      res
        .status(500)
        .json({ error: "Failed to push book fees to school fees" });
    }
  },

  // ================= DASHBOARD =================
  // GET /api/library/stats — headline numbers + per-class breakdown
  getStats: async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = getCurrentTenantId();
      if (!tenantId)
        return res.status(403).json({ error: "Tenant context missing" });
      const [totalBooks, onLoan, overdueRaw, unpaidFees, paidFees] =
        await Promise.all([
          prisma.book.aggregate({
            where: { schoolId: tenantId },
            _sum: { totalCopies: true },
          }),
          prisma.bookLoan.count({
            where: { schoolId: tenantId, status: "ON_LOAN" },
          }),
          prisma.bookLoan.findMany({
            where: {
              schoolId: tenantId,
              status: "ON_LOAN",
              dueDate: { lt: new Date() },
            },
            select: { id: true },
          }),
          prisma.bookFee.count({ where: { schoolId: tenantId, paid: false } }),
          prisma.bookFee.count({ where: { schoolId: tenantId, paid: true } }),
        ]);
      const classes = await prisma.class.findMany({
        where: { schoolId: tenantId },
        select: { id: true, name: true },
      });
      const perClass = await Promise.all(
        classes.map(async (c) => {
          const [students, issued, owing] = await Promise.all([
            prisma.student.count({
              where: { schoolId: tenantId, classId: c.id, isActive: true },
            }),
            prisma.bookLoan.count({
              where: {
                schoolId: tenantId,
                status: "ON_LOAN",
                student: { classId: c.id },
              },
            }),
            prisma.bookFee.count({
              where: {
                schoolId: tenantId,
                paid: false,
                student: { classId: c.id },
              },
            }),
          ]);
          return { classId: c.id, className: c.name, students, issued, owing };
        }),
      );
      res.json({
        totalCopies: totalBooks._sum.totalCopies || 0,
        onLoan,
        overdue: overdueRaw.length,
        unpaidFees,
        paidFees,
        perClass,
      });
    } catch (err) {
      console.error("[library.getStats]", err);
      res.status(500).json({ error: "Failed to fetch library stats" });
    }
  },
};

// Re-export the ISO helper for consumers that need it (kept for API parity).
export const _iso = iso;
