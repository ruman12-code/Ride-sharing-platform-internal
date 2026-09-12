import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { createMailer, signInLinkEmail } from "./mailer.js";

/**
 * The HTTP mailer, against a stub that stands in for Brevo.
 *
 * Worth testing precisely because it cannot be tested where it matters: the
 * reason this path exists is that the host blocks SMTP, and the only way to
 * know the request is shaped right is to catch one.
 */

let server: Server;
let received: { path: string; headers: Record<string, string>; body: unknown }[] = [];
let reply: { status: number; body: string } = { status: 200, body: "{}" };

beforeEach(async () => {
  received = [];
  reply = { status: 200, body: "{}" };
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      received.push({
        path: req.url ?? "",
        headers: req.headers as Record<string, string>,
        body: raw ? JSON.parse(raw) : undefined,
      });
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(reply.body);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  process.env["BREVO_API_URL"] = `http://127.0.0.1:${port}`;
  process.env["BREVO_API_KEY"] = "test-key";
  process.env["SMTP_FROM"] = "Ekpothe <ekpothe@example.org>";
});

afterEach(async () => {
  delete process.env["BREVO_API_URL"];
  delete process.env["BREVO_API_KEY"];
  delete process.env["SMTP_FROM"];
  await new Promise<void>((r) => server.close(() => r()));
});

describe("sending over HTTPS", () => {
  it("is chosen over SMTP when configured, because the host may block SMTP", () => {
    process.env["SMTP_HOST"] = "smtp.gmail.com";
    expect(createMailer().enabled).toBe(true);
    createMailer();
    delete process.env["SMTP_HOST"];
  });

  it("sends the link with the sender split into name and address", async () => {
    const mail = signInLinkEmail("https://ekpothe.onrender.com/enter?t=abc.def");
    expect(await createMailer().send("nusrat@personal.com", mail.subject, mail.text, mail.html)).toBe(true);

    expect(received).toHaveLength(1);
    const [req] = received;
    expect(req!.path).toBe("/v3/smtp/email");
    expect(req!.headers["api-key"]).toBe("test-key");
    expect(req!.body).toMatchObject({
      sender: { name: "Ekpothe", email: "ekpothe@example.org" },
      to: [{ email: "nusrat@personal.com" }],
      subject: "Your Ekpothe sign-in link",
    });
  });

  it("carries the link itself, in both the text and the HTML", async () => {
    const url = "https://ekpothe.onrender.com/enter?t=tYdWjcavZFvZ.1ay8Z9RO";
    const mail = signInLinkEmail(url);
    await createMailer().send("nusrat@personal.com", mail.subject, mail.text, mail.html);
    const body = received[0]!.body as { textContent: string; htmlContent: string };
    expect(body.textContent).toContain(url);
    expect(body.htmlContent).toContain(`href="${url}"`);
  });

  it("copes with a bare address, with no display name", async () => {
    process.env["SMTP_FROM"] = "ekpothe@example.org";
    await createMailer().send("x@y.z", "s", "t");
    expect(received[0]!.body).toMatchObject({ sender: { email: "ekpothe@example.org" } });
  });

  it("reports a rejected key in words, not as a status code", async () => {
    reply = { status: 401, body: '{"message":"Key not found"}' };
    const v = await createMailer().verify();
    expect(v.ok).toBe(false);
    expect(v.error).toContain("API key was rejected");
  });

  it("verifies against the account endpoint", async () => {
    expect(await createMailer().verify()).toEqual({ ok: true });
    expect(received[0]!.path).toBe("/v3/account");
  });

  it("reports failure without saying whether the address exists", async () => {
    reply = { status: 400, body: '{"message":"sender not valid"}' };
    // False, not a throw, and nothing about the recipient reaches the caller.
    expect(await createMailer().send("nusrat@personal.com", "s", "t")).toBe(false);
  });
});

describe("choosing a transport", () => {
  it("is inert without a from address, and says so", async () => {
    delete process.env["BREVO_API_KEY"];
    delete process.env["SMTP_FROM"];
    const m = createMailer();
    expect(m.enabled).toBe(false);
    expect((await m.verify()).error).toContain("SMTP_FROM");
  });

  it("is inert when neither transport is configured", async () => {
    delete process.env["BREVO_API_KEY"];
    const m = createMailer();
    expect(m.enabled).toBe(false);
    expect((await m.verify()).error).toContain("BREVO_API_KEY");
  });
});
