import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER || "noreply@example.com";

export function isEmailConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function getTransporter() {
  if (!isEmailConfigured()) {
    throw new Error("SMTP not configured");
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

/** HTML-письмо в стиле сайта: тёмный фон, золотой акцент */
export function getEmailChangeCodeHtml(code: string, locale: "en" | "ru" | "es" = "ru"): string {
  const texts: Record<string, { title: string; hello: string; intro: string; codeLabel: string; expiry: string; footer: string }> = {
    ru: {
      title: "Код для смены email",
      hello: "Здравствуйте!",
      intro: "Вы запросили смену адреса электронной почты. Введите этот код в личном кабинете:",
      codeLabel: "Код подтверждения",
      expiry: "Код действителен 15 минут.",
      footer: "Если вы не запрашивали смену почты, проигнорируйте это письмо."
    },
    en: {
      title: "Email change verification code",
      hello: "Hello!",
      intro: "You requested to change your email address. Enter this code in your account settings:",
      codeLabel: "Verification code",
      expiry: "This code expires in 15 minutes.",
      footer: "If you did not request this change, please ignore this email."
    },
    es: {
      title: "Código para cambiar el correo",
      hello: "¡Hola!",
      intro: "Solicitaste cambiar tu correo electrónico. Introduce este código en tu cuenta:",
      codeLabel: "Código de verificación",
      expiry: "El código es válido 15 minutos.",
      footer: "Si no solicitaste este cambio, ignora este correo."
    }
  };
  const t = texts[locale] || texts.ru;
  return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t.title}</title>
</head>
<body style="margin:0; padding:0; background:#0B0E11; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #f1f5f9; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0B0E11; min-height:100vh;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 440px; background: rgba(22, 26, 30, 0.9); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; box-shadow: 0 8px 30px rgba(2,6,23,0.3), 0 0 30px rgba(240,185,11,0.06);">
          <tr>
            <td style="padding: 28px 24px 24px;">
              <div style="width: 40px; height: 4px; background: linear-gradient(90deg, #F0B90B 0%, #E5A506 100%); border-radius: 2px; margin-bottom: 24px;"></div>
              <h1 style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #f1f5f9; letter-spacing: -0.02em;">${t.title}</h1>
              <p style="margin: 0 0 20px; font-size: 14px; color: #94a3b8;">${t.hello}</p>
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.5; color: #cbd5e1;">${t.intro}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin: 20px 0;">
                <tr>
                  <td style="background: rgba(240, 185, 11, 0.12); border: 1px solid rgba(240, 185, 11, 0.35); border-radius: 8px; padding: 16px 20px; text-align: center;">
                    <p style="margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8;">${t.codeLabel}</p>
                    <p style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.2em; color: #F0B90B; font-variant-numeric: tabular-nums;">${code}</p>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 12px; color: #64748b;">${t.expiry}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 24px 28px; border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5;">${t.footer}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}

export type SendEmailChangeCodeOptions = {
  to: string;
  code: string;
  locale?: "en" | "ru" | "es";
};

export async function sendEmailChangeCode(options: SendEmailChangeCodeOptions): Promise<void> {
  const transporter = getTransporter();
  const locale = options.locale || "ru";
  const subject = locale === "ru" ? "Код для смены email" : locale === "en" ? "Email change verification code" : "Código para cambiar el correo";
  await transporter.sendMail({
    from: MAIL_FROM,
    to: options.to,
    subject,
    html: getEmailChangeCodeHtml(options.code, locale),
    text: `${locale === "ru" ? "Код подтверждения" : "Verification code"}: ${options.code}`
  });
}

/** HTML для письма восстановления пароля (ссылка) */
function getPasswordResetHtml(resetLink: string, locale: "en" | "ru" | "es" = "ru"): string {
  const texts: Record<string, { title: string; hello: string; intro: string; button: string; expiry: string; footer: string }> = {
    ru: {
      title: "Восстановление пароля",
      hello: "Здравствуйте!",
      intro: "Вы запросили сброс пароля. Нажмите кнопку ниже, чтобы задать новый пароль:",
      button: "Сбросить пароль",
      expiry: "Ссылка действительна 1 час.",
      footer: "Если вы не запрашивали сброс пароля, проигнорируйте это письмо."
    },
    en: {
      title: "Password reset",
      hello: "Hello!",
      intro: "You requested a password reset. Click the button below to set a new password:",
      button: "Reset password",
      expiry: "This link expires in 1 hour.",
      footer: "If you did not request this, please ignore this email."
    },
    es: {
      title: "Restablecer contraseña",
      hello: "¡Hola!",
      intro: "Solicitaste restablecer la contraseña. Haz clic en el botón para establecer una nueva:",
      button: "Restablecer contraseña",
      expiry: "El enlace es válido 1 hora.",
      footer: "Si no solicitaste esto, ignora este correo."
    }
  };
  const t = texts[locale] || texts.ru;
  return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t.title}</title>
</head>
<body style="margin:0; padding:0; background:#0B0E11; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f1f5f9; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0B0E11; min-height:100vh;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 440px; background: rgba(22, 26, 30, 0.9); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; box-shadow: 0 8px 30px rgba(2,6,23,0.3), 0 0 30px rgba(240,185,11,0.06);">
          <tr>
            <td style="padding: 28px 24px 24px;">
              <div style="width: 40px; height: 4px; background: linear-gradient(90deg, #F0B90B 0%, #E5A506 100%); border-radius: 2px; margin-bottom: 24px;"></div>
              <h1 style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #f1f5f9;">${t.title}</h1>
              <p style="margin: 0 0 20px; font-size: 14px; color: #94a3b8;">${t.hello}</p>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.5; color: #cbd5e1;">${t.intro}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #F0B90B 0%, #E5A506 100%); color: #0B0E11; font-size: 14px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 8px;">${t.button}</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 12px; color: #64748b;">${t.expiry}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 24px 28px; border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5;">${t.footer}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}

export type SendPasswordResetOptions = {
  to: string;
  resetLink: string;
  locale?: "en" | "ru" | "es";
};

export async function sendPasswordReset(options: SendPasswordResetOptions): Promise<void> {
  const transporter = getTransporter();
  const locale = options.locale || "ru";
  const subject = locale === "ru" ? "Восстановление пароля" : locale === "en" ? "Password reset" : "Restablecer contraseña";
  await transporter.sendMail({
    from: MAIL_FROM,
    to: options.to,
    subject,
    html: getPasswordResetHtml(options.resetLink, locale),
    text: `${locale === "ru" ? "Ссылка для сброса пароля" : "Password reset link"}: ${options.resetLink}`
  });
}
