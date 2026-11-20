// One-off script: create the library collections (books, book_loans, book_fees)
// with the indexes defined in schema.prisma, plus a partial unique index on
// Student.studentCode so a db push can succeed (existing students have null
// studentCode values, which the plain unique index would collide on).
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const v = (name) =>
  name
    .replace("books", "book")
    .replace("book_loans", "loan")
    .replace("book_fees", "fee");

async function main() {
  await p.$runCommandRaw({
    createIndexes: "books",
    indexes: [
      { key: { schoolId: 1, title: 1 }, name: "books_schoolId_title_idx" },
    ],
  });
  await p.$runCommandRaw({
    createIndexes: "book_loans",
    indexes: [
      {
        key: { schoolId: 1, bookId: 1 },
        name: "book_loans_schoolId_bookId_idx",
      },
      {
        key: { schoolId: 1, studentId: 1 },
        name: "book_loans_schoolId_studentId_idx",
      },
      {
        key: { schoolId: 1, status: 1 },
        name: "book_loans_schoolId_status_idx",
      },
    ],
  });
  await p.$runCommandRaw({
    createIndexes: "book_fees",
    indexes: [
      { key: { schoolId: 1, paid: 1 }, name: "book_fees_schoolId_paid_idx" },
      {
        key: { studentId: 1, bookId: 1 },
        name: "book_fees_studentId_bookId_key",
        unique: true,
      },
    ],
  });
  // Partial unique index on studentCode so nulls don't collide.
  await p.$runCommandRaw({
    createIndexes: "Student",
    indexes: [
      {
        key: { studentCode: 1 },
        name: "Student_studentCode_key",
        unique: true,
        partialFilterExpression: { studentCode: { $type: "string" } },
      },
    ],
  });
  await p.$runCommandRaw({
    createIndexes: "Student",
    indexes: [
      {
        key: { schoolId: 1, studentCode: 1 },
        name: "Student_schoolId_studentCode_idx",
      },
    ],
  });
  console.log("library collections + indexes created");
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
