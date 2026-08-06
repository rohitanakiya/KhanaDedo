/**
 * Email sender — Resend-backed with graceful degradation.
 *
 * When RESEND_API_KEY is not set (local dev, CI, etc.), the sender
 * logs the email to console instead of sending it. Callers get the
 * same success response — the intent is "we tried to send an email",
 * not "the email definitely reached the user's inbox" (email is
 * always best-effort anyway).
 *
 * Rendering: plaintext + minimal HTML side-by-side. Password reset
 * emails need to be readable in every client, and we're not sending
 * marketing so we don't need fancy layouts.
 */

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

/**
 * FROM address. Without a verified custom domain, Resend requires
 * we use their sandbox address which only sends to the account
 * owner's verified email. When we get a domain (khanadedo.app etc)
 * this becomes `noreply@khanadedo.app`.
 */
const FROM_ADDRESS =
  process.env.RESEND_FROM_ADDRESS ??
  "KhanaDedo <onboarding@resend.dev>";

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailResult {
  sent: boolean;
  provider: "resend" | "console";
  id?: string;
  error?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Dev / no-provider fallback — log to console so we can see the
    // reset link during local testing.
    console.log(
      `\n=== [email fallback — RESEND_API_KEY not set] ===\n` +
        `To:      ${payload.to}\n` +
        `Subject: ${payload.subject}\n\n` +
        `${payload.text}\n` +
        `=================================================\n`
    );
    return { sent: true, provider: "console" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [payload.to],
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(
        `[email] Resend ${response.status} for ${payload.to}: ${body.slice(0, 200)}`
      );
      return {
        sent: false,
        provider: "resend",
        error: `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as { id?: string };
    return { sent: true, provider: "resend", id: data.id };
  } catch (err) {
    console.warn(
      `[email] Resend send failed for ${payload.to}: ${(err as Error).message}`
    );
    return {
      sent: false,
      provider: "resend",
      error: (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ------- Templates -------

export function passwordResetEmail(args: {
  resetUrl: string;
  expiresInMinutes: number;
}): { subject: string; text: string; html: string } {
  const subject = "Reset your KhanaDedo password";

  const text = `Someone (hopefully you) requested a password reset for your KhanaDedo account.

Reset link (valid for ${args.expiresInMinutes} minutes, single-use):
${args.resetUrl}

If you didn't request this, ignore this email — your password won't change.

— KhanaDedo`;

  const html = `<!DOCTYPE html>
<html>
  <body style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 40px auto; padding: 0 24px; color: #1f2937;">
    <h1 style="color: #059669; font-family: Georgia, serif; font-style: italic; font-size: 28px; margin-bottom: 8px;">KhanaDedo</h1>
    <p style="color: #4b5563; margin-top: 24px;">Someone (hopefully you) requested a password reset for your KhanaDedo account.</p>
    <p style="margin: 24px 0;">
      <a href="${args.resetUrl}"
         style="display: inline-block; background: linear-gradient(90deg, #f59300, #ffb020); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-weight: 500;">
        Reset your password
      </a>
    </p>
    <p style="color: #6b7280; font-size: 14px;">Link valid for ${args.expiresInMinutes} minutes, single-use.</p>
    <p style="color: #6b7280; font-size: 14px;">If you didn't request this, ignore this email — your password won't change.</p>
    <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
      If the button doesn't work, paste this into your browser:<br />
      <span style="word-break: break-all;">${args.resetUrl}</span>
    </p>
  </body>
</html>`;

  return { subject, text, html };
}
