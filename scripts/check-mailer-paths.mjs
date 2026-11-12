// Check where otp_mailer.php actually lives and whether the deployed copy of
// password_reset_mailer.php matches the local one (a stale upload would still
// run but might send with old branding — more importantly, find the real path).
const paths = [
  "https://pkluster.online/smartedufy/password_reset_mailer.php",
  "https://pkluster.online/otp_mailer.php",
  "https://pkluster.online/smartedufy/otp_mailer.php",
  "https://pkluster.online/smartedufy/",
];
for (const p of paths) {
  try {
    const res = await fetch(p, { method: "GET", redirect: "manual" });
    const body = await res.text();
    console.log(
      `${p} -> ${res.status} ${res.headers.get("content-type")} (${body.length} bytes) ${body.slice(0, 80).replace(/\n/g, " ")}`,
    );
  } catch (e) {
    console.log(`${p} -> THREW ${e.message}`);
  }
}
