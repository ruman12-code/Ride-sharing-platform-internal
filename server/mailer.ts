import { createTransport, type Transporter } from "nodemailer";

/**
 * Sends the access code to the address that asked for it.
 *
 * This is what turns domain gating from a claim into a proof. Anyone can *type*
 * `someone@giz.de`; only the person who can read that mailbox can retrieve a
 * code sent to it. Without this step, automatic approval on domain alone would
 * admit anybody who knows what the domain is — which is everybody.
 *
 * When no SMTP host is configured the mailer is inert and the server falls back
 * to the administrator relaying codes by hand. That path still works; it simply
 * cannot be automatic, because nothing has proved the address belongs to the
 * person asking.
 */
export interface MailBody {
  readonly subject: string;
  readonly text: string;
  /** Optional HTML alternative, so a link is a real tap target. */
  readonly html?: string;
}

export interface Mailer {
  /** True when SMTP settings are present. Says nothing about whether they work. */
  readonly enabled: boolean;
  /**
   * Actually open a connection and authenticate.
   *
   * `enabled` only means the settings are non-empty, which is satisfied just as
   * well by a placeholder as by a real relay. A wrong password, a blocked port,
   * or a leftover `SMTP_HOST=localhost` all look identical until something is
   * sent — and the first thing sent is the mail telling a colleague they were
   * approved. Better to find out at boot than to find out from the colleague.
   */
  verify(): Promise<{ ok: boolean; error?: string }>;
  send(to: string, subject: string, text: string, html?: string): Promise<boolean>;
}

export const createMailer = (): Mailer => {
  const host = process.env["SMTP_HOST"];
  const from = process.env["SMTP_FROM"];

  if (!host || !from) {
    return {
      enabled: false,
      async verify() {
        return { ok: false, error: "SMTP_HOST and SMTP_FROM are not set" };
      },
      async send() {
        return false;
      },
    };
  }

  const port = Number(process.env["SMTP_PORT"] ?? 587);
  const user = process.env["SMTP_USER"];
  const transport: Transporter = createTransport({
    host,
    port,
    // STARTTLS on 587 is the norm; implicit TLS on 465 is the exception.
    secure: port === 465,
    // Spread rather than an undefined value: some relays reject a login
    // attempt outright, so an unauthenticated transport has to omit the key
    // entirely rather than pass an empty one.
    ...(user ? { auth: { user, pass: process.env["SMTP_PASS"] ?? "" } } : {}),
  });

  return {
    enabled: true,
    async verify() {
      try {
        await transport.verify();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async send(to, subject, text, html) {
      try {
        await transport.sendMail({ from, to, subject, text, ...(html ? { html } : {}) });
        return true;
      } catch (e) {
        // Logged, never surfaced. A failure here must not tell the person at
        // the form whether that address exists or was deliverable.
        console.error("mail send failed:", e);
        return false;
      }
    },
  };
};

/**
 * The message a colleague receives.
 *
 * Plain text on purpose: it renders identically everywhere, cannot carry a
 * tracking pixel, and reads as a note from a colleague rather than a campaign.
 */
export const accessCodeEmail = (code: string, appUrl: string): { subject: string; text: string } => ({
  subject: `Your Ekpothe code: ${code}`,
  text: [
    "Ekpothe — sharing rides with colleagues",
    "",
    `Your code is:  ${code}`,
    "",
    `Sign in at ${appUrl} with your work email and this code.`,
    "It works once and expires in seven days.",
    "",
    "If you did not ask for this, ignore it — nothing has been created for you",
    "beyond a pending request, and it will lapse.",
    "",
    "Ekpothe is a voluntary tool built by a colleague. It is not an official",
    "system, and taking part is entirely your choice.",
  ].join("\n"),
});

/**
 * The sign-in link.
 *
 * Short on purpose. It is read on a phone, usually while walking, and the only
 * thing that matters is the link. The two facts underneath it — once, twenty
 * minutes — are there so that a colleague who taps an old one understands what
 * happened rather than concluding the app is broken.
 *
 * The last line matters more than it looks: an unexpected sign-in mail is
 * exactly what a person should be able to ignore safely, and saying so is what
 * stops somebody tapping a link they did not ask for.
 */
export const signInLinkEmail = (url: string): MailBody => ({
  subject: "Your Ekpothe sign-in link",
  text: [
    "Tap to sign in to Ekpothe:",
    "",
    url,
    "",
    "This link works once and expires in 20 minutes.",
    "If you didn't ask for it, you can ignore this — nobody can get in without it.",
    "",
    "— Ekpothe",
  ].join("\n"),
  /*
    An HTML alternative as well as the text.

    Not decoration: it makes the link a real anchor, so the tap target does not
    depend on the client guessing where a URL starts and ends in wrapped plain
    text. Deliberately plain — inline styles only, no images, no external CSS —
    because that is what survives a mail client, and because a sign-in mail that
    looks like marketing is a sign-in mail people distrust.
  */
  html: [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#12211b">',
    "<p>Tap to sign in to Ekpothe:</p>",
    `<p><a href="${url}" style="display:inline-block;background:#14503a;color:#fff;`,
    'text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Sign in to Ekpothe</a></p>',
    '<p style="color:#566259;font-size:14px">This link works once and expires in 20 minutes.<br>',
    "If you didn't ask for it, you can ignore this — nobody can get in without it.</p>",
    '<p style="color:#7c877f;font-size:13px">— Ekpothe</p>',
    "</div>",
  ].join(""),
});
