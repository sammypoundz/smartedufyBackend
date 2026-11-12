// Compare request formats against the live mailer to find what the server accepts.
const url = "https://pkluster.online/smartedufy/password_reset_mailer.php";
const otpUrl = "https://pkluster.online/smartedufy/otp_mailer.php";

async function probe(label, target, opts) {
  try {
    const res = await fetch(target, opts);
    const text = await res.text();
    console.log(
      `[${label}] status=${res.status} ct=${res.headers.get("content-type")} body=${text.slice(0, 200)}`,
    );
  } catch (e) {
    console.log(`[${label}] THREW: ${e.message}`);
  }
}

const link =
  "https://smartedufy.ng/reset-password?token=abc123&email=test%40example.com";

await probe("reset json", url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "test@example.com", reset_link: link }),
});

await probe("reset form", url, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    email: "test@example.com",
    reset_link: link,
  }).toString(),
});

await probe("otp json (known-good baseline)", otpUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "test@example.com", otp: "123456" }),
});

// Is the file reachable at all / maybe a 404 with HTML?
await probe("reset GET", url, { method: "GET" });
