/**
 * E-Mail-Versand (z. B. Passwort-Zurücksetzen).
 * Konfiguration über .env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM.
 */
import nodemailer from 'nodemailer'

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10)
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1'
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM || process.env.MAIL_FROM || 'Kasse <noreply@example.com>'

function getTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
}

/**
 * Sendet E-Mail mit Link zum Zurücksetzen des Passworts.
 * @param {string} to - E-Mail-Adresse des Nutzers
 * @param {string} resetLink - Vollständiger Link (z. B. https://app.example.com/reset-password?token=xxx)
 * @param {string} [appName] - App-Name für Betreff/Text
 * @returns {Promise<boolean>} true wenn gesendet, false wenn SMTP nicht konfiguriert oder Fehler
 */
export async function sendPasswordResetEmail(to, resetLink, appName = 'Kasse') {
  const transport = getTransporter()
  if (!transport) return false
  try {
    await transport.sendMail({
      from: SMTP_FROM,
      to,
      subject: `${appName} – Passwort zurücksetzen`,
      text: `Hallo,\n\nDu hast angefordert, dein Passwort zurückzusetzen. Klicke auf den folgenden Link (gültig 1 Stunde):\n\n${resetLink}\n\nFalls du das nicht angefordert hast, ignoriere diese E-Mail.\n\nViele Grüße\n${appName}`,
      html: `<p>Hallo,</p><p>Du hast angefordert, dein Passwort zurückzusetzen. Klicke auf den folgenden Link (gültig 1 Stunde):</p><p><a href="${resetLink}">Passwort zurücksetzen</a></p><p>Falls du das nicht angefordert hast, ignoriere diese E-Mail.</p><p>Viele Grüße<br>${appName}</p>`,
    })
    return true
  } catch (e) {
    console.error('E-Mail senden fehlgeschlagen:', e.message)
    return false
  }
}

/** Gibt true zurück, wenn SMTP konfiguriert ist (für Passwort vergessen). */
export function isMailConfigured() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS)
}
