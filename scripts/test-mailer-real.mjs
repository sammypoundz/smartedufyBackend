// Send to a real mailbox on the account's own domain so we can see whether SMTP
// actually delivers (local delivery rarely fails) — and capture PHPMailer's
// underlying error by asking the server for verbose output is not possible, so
// instead we diff behaviour: same script, different port/security settings.
const url = "https://pkluster.online/smartedufy/password_reset_mailer.php";
const link =
  "https://smartedufy.ng/reset-password?token=abc123&email=test%40example.com";

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "smartedufy@pkluster.online",
    reset_link: link,
  }),
});
console.log("status:", res.status);
console.log("body:", (await res.text()).slice(0, 300));
