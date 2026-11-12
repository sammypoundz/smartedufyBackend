// Probe the live PHP reset mailer the same way the backend calls it.
const url =
  process.argv[2] ||
  "https://pkluster.online/smartedufy/password_reset_mailer.php";
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "test@example.com",
    reset_link:
      "https://smartedufy.ng/reset-password?token=testtoken123&email=test%40example.com",
  }),
});
console.log("status:", res.status);
const text = await res.text();
console.log("body (first 500 chars):", text.slice(0, 500));
