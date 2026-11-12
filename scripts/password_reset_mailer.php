<?php
// SmartEdufy password-reset endpoint — POST { "email": "...", "reset_link": "https://..." }
// Responds with JSON: { "success": true } or { "success": false, "error": "..." }
// PHPMailer lives beside this file: phpmailer/src/
//
// Deploy this to https://pkluster.online/smartedufy/password_reset_mailer.php
// (same folder as otp_mailer.php so it shares the phpmailer/src/ copy).

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Load PHPMailer from this file's own folder
$mailer_src = __DIR__ . '/phpmailer/src/';

if (
    file_exists($mailer_src . 'PHPMailer.php') &&
    file_exists($mailer_src . 'Exception.php') &&
    file_exists($mailer_src . 'SMTP.php')
) {
    require_once $mailer_src . 'Exception.php';
    require_once $mailer_src . 'PHPMailer.php';
    require_once $mailer_src . 'SMTP.php';
} else {
    error_log('password_reset_mailer.php: PHPMailer not found at ' . $mailer_src);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'PHPMailer files missing on server']);
    exit;
}

// --- Read input (JSON body or form POST) ---
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}

$to_email   = isset($input['email']) ? trim($input['email']) : '';
$reset_link = isset($input['reset_link']) ? trim($input['reset_link']) : '';

if ($to_email === '' || !filter_var($to_email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'A valid email is required']);
    exit;
}
if ($reset_link === '' || !filter_var($reset_link, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'A valid reset link is required']);
    exit;
}

// Basic header-injection guard: strip CR/LF from values placed in headers.
$to_email   = str_replace(["\r", "\n"], '', $to_email);

function send_reset_email($to_email, $reset_link) {
    $mail = new PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host       = 'www.pkluster.online';
        $mail->SMTPAuth   = true;
        $mail->Username   = 'smartedufy@pkluster.online';
        $mail->Password   = 'Precious1035';
        $mail->SMTPSecure = 'tls';
        $mail->Port       = 587;

        $mail->SMTPOptions = [
            'ssl' => [
                'verify_peer'       => false,
                'verify_peer_name'  => false,
                'allow_self_signed' => true
            ]
        ];

        // From must be the authenticated mailbox on most cPanel mailservers
        // (mismatches are silently rejected as relay-attempt).
        $mail->setFrom('smartedufy@pkluster.online', 'SmartEdufy');
        $mail->addReplyTo('smartedufy@pkluster.online', 'SmartEdufy');
        $mail->addAddress($to_email);
        $mail->isHTML(true);

        $mail->Subject = 'Reset your SmartEdufy password';

        // Escape the link for HTML output
        $link_html = htmlspecialchars($reset_link, ENT_QUOTES, 'UTF-8');

        // SmartEdufy-branded email body (dark/gold design language)
        $mail->Body = "
        <html>
        <body style='margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f1e8;padding:24px;'>
          <div style='max-width:480px;margin:auto;background:#101820;border-radius:16px;padding:36px 28px;text-align:center;'>
            <div style='font-size:22px;font-weight:800;color:#C99A2E;letter-spacing:2px;margin-bottom:22px;'>SMARTEDUFY</div>
            <h2 style='margin:0 0 10px;color:#e6ecf2;font-size:20px;'>Password Reset</h2>
            <p style='margin:0 0 24px;color:#8b96a5;font-size:14px;line-height:1.5;'>
              We received a request to reset your SmartEdufy account password.<br>
              Click the button below to choose a new one:
            </p>
            <div style='margin:0 0 24px;'>
              <a href='$link_html' style='display:inline-block;background:#C99A2E;color:#101820;font-size:16px;font-weight:800;letter-spacing:1px;text-decoration:none;border-radius:12px;padding:14px 28px;'>RESET PASSWORD</a>
            </div>
            <p style='margin:0 0 8px;color:#8b96a5;font-size:13px;line-height:1.6;'>
              Or copy and paste this link into your browser:<br>
              <span style='color:#C99A2E;word-break:break-all;'>$link_html</span>
            </p>
            <p style='margin:0;color:#8b96a5;font-size:13px;line-height:1.6;'>
              This link expires in <strong style='color:#e6ecf2;'>1 hour</strong> and can be used once.<br>
              If you didn't request a reset, you can safely ignore this email &mdash;
              your password will stay unchanged.
            </p>
            <div style='margin-top:26px;padding-top:18px;border-top:1px solid #26303b;font-size:11px;color:#5a6572;'>
              &copy; SmartEdufy &mdash; school management platform
            </div>
          </div>
        </body>
        </html>";

        // Plain-text fallback for clients that block HTML
        $mail->AltBody = "We received a request to reset your SmartEdufy password.\n"
            . "Open this link to choose a new one (valid for 1 hour, single use):\n"
            . "$reset_link\n\n"
            . "If you didn't request this, ignore this email — your password stays unchanged.";

        $mail->send();
        return true;
    } catch (Exception $e) {
        // Log the REAL PHPMailer error to a file beside this script so the
        // failure reason can be read on the server (SMTP auth/refusal etc).
        $err = date('c') . " | to=$to_email | " . $mail->ErrorInfo . "\n";
        @file_put_contents(__DIR__ . '/mailer_error.log', $err, FILE_APPEND);
        error_log('Password reset mail failed: ' . $mail->ErrorInfo);
        return false;
    }
}

$ok = send_reset_email($to_email, $reset_link);

if ($ok) {
    echo json_encode(['success' => true]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to send email. Try again shortly.']);
}
