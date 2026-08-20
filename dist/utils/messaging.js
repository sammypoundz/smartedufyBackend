"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSMS = exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
// Email transporter (configured immediately)
const emailTransporter = nodemailer_1.default.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});
const sendEmail = async (to, subject, text) => {
    try {
        const info = await emailTransporter.sendMail({
            from: process.env.EMAIL_FROM || 'noreply@yourschool.com',
            to,
            subject,
            text,
        });
        console.log(`Email sent to ${to}: ${info.messageId}`);
        return true;
    }
    catch (error) {
        console.error('Email sending failed:', error);
        throw new Error('Failed to send email');
    }
};
exports.sendEmail = sendEmail;
// ---------- Termii SMS integration ----------
// Environment variables needed:
// TERMII_API_KEY    – your Termii API key (e.g., "TL......")
// TERMII_SENDER_ID  – your approved sender ID (e.g., "SchoolName")
// TERMII_BASE_URL   – optional, defaults to "https://api.termii.com/api/sms/send"
async function sendTermiiSMS(to, message) {
    const apiKey = process.env.TERMII_API_KEY;
    const senderId = process.env.TERMII_SENDER_ID || 'SchoolAlert';
    const baseUrl = process.env.TERMII_BASE_URL || 'https://api.termii.com/api/sms/send';
    if (!apiKey) {
        throw new Error('TERMII_API_KEY is not configured. SMS cannot be sent.');
    }
    // Normalize phone number: ensure it starts with country code (e.g., 234...)
    let normalizedTo = to.replace(/\s+/g, '');
    if (normalizedTo.startsWith('0')) {
        // Replace leading 0 with Nigeria country code 234
        normalizedTo = `234${normalizedTo.substring(1)}`;
    }
    else if (!normalizedTo.startsWith('234')) {
        // Add 234 if no code present (assume Nigeria)
        normalizedTo = `234${normalizedTo}`;
    }
    const payload = {
        to: normalizedTo,
        from: senderId,
        sms: message,
        type: 'plain',
        channel: 'generic',
        api_key: apiKey,
    };
    try {
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok || data.code !== 'ok') {
            console.error('Termii error response:', data);
            throw new Error(data.message || 'Termii SMS sending failed');
        }
        console.log(`SMS sent to ${normalizedTo} via Termii, message ID: ${data.message_id}`);
        return true;
    }
    catch (error) {
        console.error('Termii SMS sending failed:', error);
        throw new Error('Failed to send SMS via Termii');
    }
}
// Public SMS function – same interface as before
const sendSMS = async (to, message) => {
    return sendTermiiSMS(to, message);
};
exports.sendSMS = sendSMS;
