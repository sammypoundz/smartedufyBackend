// Smoke test: full renderPdf pipeline (HTML → Puppeteer → PDF buffer).
(async () => {
  const { renderPdf } = require("../dist/services/reportCardRenderService.js");
  const html = `<!DOCTYPE html><html><head><style>
    body { font-family: Arial; margin: 0; }
    h1 { text-align: center; }
    table { width: 100%; border-collapse: collapse; }
    td, th { border: 1px solid #333; padding: 6px; }
  </style></head><body>
    <h1>Demo Test School — Term Report Card</h1>
    <p>Student: <b>John Doe</b> &nbsp; Class: JSS 1</p>
    <table><tr><th>Subject</th><th>Score</th></tr>
      <tr><td>Mathematics</td><td>85</td></tr>
      <tr><td>English</td><td>78</td></tr>
    </table>
  </body></html>`;
  const buf = await renderPdf(html, { size: "A4", orientation: "portrait" });
  console.log("PDF bytes:", buf.length);
  console.log("header:", buf.subarray(0, 5).toString());
  if (buf.subarray(0, 5).toString() !== "%PDF-") throw new Error("Not a PDF!");
  console.log("TEMPLATE RENDER OK");
})().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exitCode = 1;
});
