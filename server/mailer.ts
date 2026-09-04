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
export interface Mailer {
  readonly enabled: boolean;
  send(to: string, subject: string, text: string): Promise<boolean>;
}

export const createMailer = (): Mailer => {
  const host = process.env["SMTP_HOST"];
  const from = process.env["SMTP_FROM"];

  if (!host || !from) {
    return {
      enabled: false,
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
    async send(to, subject, text) {
      try {
        await transport.sendMail({ from, to, subject, text });
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
