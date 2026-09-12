import { isIP } from "node:net";
import { resolve4 } from "node:dns/promises";
import { createTransport, type Transporter } from "nodemailer";

/**
 * Getting mail out of the building.
 *
 * Sign-in links are the only way into this app, so this file is the entrance.
 *
 * **Two ways to send, and which one you need depends on your host.** Plenty of
 * platforms block outbound SMTP entirely to stop their free tiers being used
 * for spam — Render blocks ports 25, 465 and 587 on free web services, as
 * policy, since September 2025. On one of those, no SMTP configuration can
 * work: the connection simply hangs, which reads like a wrong password and is
 * nothing of the kind. It cost this pilot a launch to establish.
 *
 * So an HTTP path exists alongside the SMTP one. It posts to a provider's API
 * over 443, which nobody blocks, and it is selected simply by configuring it.
 * SMTP remains for hosts that allow it, because where it works it is one fewer
 * account to hold.
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
  /**
   * Why the last send failed, if one did.
   *
   * `verify()` only proves the credential is good. The failure that gets past
   * it is an unverified sender address: the key is accepted, every check
   * passes, and each send is refused. Without this, the administrator sees a
   * healthy app, colleagues see nothing arrive, and there is no thread to pull
   * — which is precisely the hole this pilot fell into twice.
   */
  lastSendError(): string | undefined;
}

/** A mailer that is configured but has nothing behind it. */
const inert = (reason: string): Mailer => ({
  enabled: false,
  async verify() {
    return { ok: false, error: reason };
  },
  async send() {
    return false;
  },
  lastSendError() {
    return reason;
  },
});

/**
 * Parse `Ekpothe <ekpothe@example.org>` into its parts.
 *
 * HTTP APIs want the name and address separately, where SMTP took one string.
 */
const parseFrom = (from: string): { name: string; email: string } => {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m?.[2] ? { name: m[1] || "Ekpothe", email: m[2].trim() } : { name: "Ekpothe", email: from.trim() };
};

/**
 * Send over HTTPS, through Brevo's transactional API.
 *
 * Port 443, so no host blocks it. Brevo's free tier needs no card and allows a
 * single verified sender address, which is what makes it usable without owning
 * a domain.
 *
 * The base URL is configurable so the request shape can be tested against a
 * local stub rather than by sending real mail to a real person.
 */
const createHttpMailer = (apiKey: string, from: string): Mailer => {
  const base = (process.env["BREVO_API_URL"] ?? "https://api.brevo.com").replace(/\/$/, "");
  const sender = parseFrom(from);
  let lastError: string | undefined;

  return {
    enabled: true,
    lastSendError: () => lastError,

    async verify() {
      try {
        const res = await fetch(`${base}/v3/account`, {
          headers: { "api-key": apiKey, accept: "application/json" },
          signal: AbortSignal.timeout(12_000),
        });
        if (res.ok) return { ok: true };
        // 401 means the key is wrong, which is worth saying in those words
        // rather than as a status code.
        const detail = res.status === 401 ? "the API key was rejected" : `HTTP ${res.status}`;
        return { ok: false, error: `Brevo refused the check — ${detail}` };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },

    async send(to, subject, text, html) {
      try {
        const res = await fetch(`${base}/v3/smtp/email`, {
          method: "POST",
          headers: {
            "api-key": apiKey,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            sender,
            to: [{ email: to }],
            subject,
            textContent: text,
            ...(html ? { htmlContent: html } : {}),
          }),
          signal: AbortSignal.timeout(20_000),
        });
        if (res.ok) {
          lastError = undefined;
          return true;
        }
        // Brevo's body carries the reason — an unverified sender, most often.
        // Recorded for the health endpoint and logged; never returned to the
        // person at the form, who must not learn whether an address exists.
        const body = await res.text().catch(() => "");
        lastError = `HTTP ${res.status} from Brevo${body ? `: ${body.slice(0, 300)}` : ""}`;
        console.error("mail send failed:", lastError);
        return false;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        console.error("mail send failed:", lastError);
        return false;
      }
    },
  };
};

const createSmtpMailer = (host: string, from: string): Mailer => {
  const port = Number(process.env["SMTP_PORT"] ?? 587);
  const user = process.env["SMTP_USER"];

  /*
    Connect over IPv4, by resolving the host here rather than leaving it to the
    library.

    Nodemailer resolves the host itself, combines the IPv4 and IPv6 answers into
    one list, and then picks an address from it *at random*. On a host with no
    IPv6 route the mailer then works or fails on a coin flip, and the failure
    arrives as `connect ENETUNREACH 2404:6800:...`, which is indistinguishable
    from a wrong password unless you notice the address is IPv6.

    Resolving to an A record removes the coin flip. `servername` carries the
    original hostname so TLS still validates against the certificate rather than
    against an address that could never match it. Re-resolved per connection,
    because providers change addresses and this process runs for months.
  */
  const connectHost = async (): Promise<string> => {
    if (isIP(host)) return host;
    try {
      const [first] = await resolve4(host);
      return first ?? host;
    } catch {
      return host;
    }
  };

  const open = async (): Promise<Transporter> =>
    createTransport({
      host: await connectHost(),
      port,
      // STARTTLS on 587 is the norm; implicit TLS on 465 is the exception.
      secure: port === 465,
      // The certificate is issued to the name, not the address we dialled.
      tls: { servername: host },
      // Spread rather than an undefined value: some relays reject a login
      // attempt outright, so an unauthenticated transport has to omit the key
      // entirely rather than pass an empty one.
      ...(user ? { auth: { user, pass: process.env["SMTP_PASS"] ?? "" } } : {}),
    });

  let lastError: string | undefined;

  return {
    enabled: true,
    lastSendError: () => lastError,
    async verify() {
      const transport = await open();
      try {
        await transport.verify();
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // The single most common cause, and the one nobody guesses.
        const hint = /ETIMEDOUT|ENETUNREACH|timeout/i.test(msg)
          ? " — many hosts block outbound SMTP ports; if yours does, set BREVO_API_KEY and send over HTTPS instead"
          : "";
        return { ok: false, error: msg + hint };
      } finally {
        transport.close();
      }
    },
    async send(to, subject, text, html) {
      const transport = await open();
      try {
        await transport.sendMail({ from, to, subject, text, ...(html ? { html } : {}) });
        lastError = undefined;
        return true;
      } catch (e) {
        // Recorded and logged, never surfaced. A failure here must not tell the
        // person at the form whether that address exists or was deliverable.
        lastError = e instanceof Error ? e.message : String(e);
        console.error("mail send failed:", lastError);
        return false;
      } finally {
        transport.close();
      }
    },
  };
};

/**
 * Pick a way to send.
 *
 * HTTP wins when it is configured, because a host that needs it is a host where
 * SMTP cannot work at all.
 */
export const createMailer = (): Mailer => {
  const from = process.env["SMTP_FROM"];
  if (!from) return inert("SMTP_FROM is not set — nothing can say who the mail is from");

  const apiKey = process.env["BREVO_API_KEY"];
  if (apiKey) return createHttpMailer(apiKey, from);

  const host = process.env["SMTP_HOST"];
  if (!host) return inert("neither BREVO_API_KEY nor SMTP_HOST is set");

  return createSmtpMailer(host, from);
};

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
