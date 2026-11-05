// CJS smoke test: rasterise a real PDF through the compiled pdfUtils (dist).
const { PDFDocument: pdf } = require("pdf-lib");

async function main() {
  const doc = await pdf.create();
  const page = doc.addPage([300, 400]);
  page.drawText("Hello report card", { x: 40, y: 350, size: 14 });
  const bytes = await doc.save();

  const { documentToPageImages } = require("../dist/services/pdfUtils.js");
  const pages = await documentToPageImages(
    Buffer.from(bytes),
    "application/pdf",
  );
  console.log("pages:", pages.length);
  console.log("page1:", pages[0].width, "x", pages[0].height);
  console.log("base64 length:", pages[0].base64.length);
  if (!pages[0].base64.startsWith("iVBOR")) throw new Error("Not a PNG!");
  console.log("PDF rasterisation OK");
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exitCode = 1;
});
