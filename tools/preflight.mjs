import { createTransport } from "nodemailer";

/**
 * Check everything the pilot needs before it is put in front of colleagues.
 *
 * The failures this catches are all silent ones. A missing VAPID key means
 * phones are never buzzed and nothing says so. A wrong SMTP password means the
 * sign-in link — the only door — is never delivered, and the form still says
 * "on its way", because it deliberately says that whatever happens. An APP_URL
 * left on localhost means every link mailed out points at nothing.
 *
 * Each one of those looks like a working app right up until a colleague cannot
 * get in and cannot tell you why.
 *
 *   node tools/preflight.mjs                  check configuration
 *   node tools/preflight.mjs you@example.com  and send a real test email
 */

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Not an error: on a deployed host the values are real environment
    // variables and there is no file.
  }
}

const problems = [];
const warnings = [];
const ok = [];

const need = (name) => {
  const v = process.env[name];
  if (!v || !v.trim()) {
    problems.push(`${name} is not set`);
    return undefined;
  }
  return v.trim();
};

// --- who can approve people ------------------------------------------------
const admin = need("ADMIN_EMAIL");
if (admin && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(admin)) {
  problems.push(`ADMIN_EMAIL is not an email address: ${admin}`);
} else if (admin) {
  const blocked = (process.env["BLOCKED_EMAIL_DOMAINS"] ?? "giz.de")
    .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  const domain = admin.split("@")[1]?.toLowerCase() ?? "";
  // The server refuses to store a blocked address, admin included. Better to
  // find that out here than from a registration form that will not accept you.
  if (blocked.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    problems.push(
      `ADMIN_EMAIL is on a blocked domain (${domain}). The server will refuse it — use a personal address.`,
    );
  } else {
    ok.push(`admin: ${admin}`);
  }
}

// --- where the sign-in links point ----------------------------------------
const appUrl = need("APP_URL");
if (appUrl) {
  if (appUrl.includes("localhost") || appUrl.includes("127.0.0.1")) {
    problems.push(
      `APP_URL is ${appUrl} — every sign-in link emailed to a colleague would point at their own phone.`,
    );
  } else if (!appUrl.startsWith("https://")) {
    problems.push(
      `APP_URL is not https (${appUrl}). Push notifications will not work at all, and the link is sent in the clear.`,
    );
  } else {
    ok.push(`links point at: ${appUrl}`);
  }
}

// --- push ------------------------------------------------------------------
const pub = process.env["VAPID_PUBLIC_KEY"]?.trim();
const priv = process.env["VAPID_PRIVATE_KEY"]?.trim();
if (!pub || !priv) {
  warnings.push("VAPID keys missing — email still works, but no phone is ever buzzed. Run: npm run setup");
} else if (pub.length < 80 || priv.length < 40) {
  problems.push("VAPID keys look malformed. Regenerate with: npm run setup");
} else {
  ok.push("push keys present");
}

// --- email: the one that must work ----------------------------------------
const host = need("SMTP_HOST");
const from = need("SMTP_FROM");
need("SMTP_PORT");

const report = () => {
  console.log("");
  for (const line of ok) console.log(`  ok       ${line}`);
  for (const line of warnings) console.log(`  warning  ${line}`);
  for (const line of problems) console.log(`  PROBLEM  ${line}`);
  console.log("");
  if (problems.length === 0) {
    console.log(
      warnings.length === 0
        ? "Ready. Nothing is missing."
        : "Ready, with warnings above.",
    );
  } else {
    console.log(`${problems.length} problem(s) to fix before inviting anybody.`);
  }
  process.exit(problems.length === 0 ? 0 : 1);
};

if (!host || !from) report();

const port = Number(process.env["SMTP_PORT"] ?? 587);
const user = process.env["SMTP_USER"];
const transport = createTransport({
  host,
  port,
  secure: port === 465,
  ...(user ? { auth: { user, pass: process.env["SMTP_PASS"] ?? "" } } : {}),
});

try {
  await transport.verify();
  ok.push(`smtp: ${host}:${port} accepted the login`);
} catch (e) {
  problems.push(
    `smtp: ${host}:${port} refused — ${e instanceof Error ? e.message : String(e)}\n` +
      "           Nobody can sign in until this works. See docs/EMAIL_SETUP.md",
  );
  report();
}

const to = process.argv[2];
if (to) {
  try {
    await transport.sendMail({
      from,
      to,
      subject: "Ekpothe preflight",
      text: [
        "If you are reading this, sign-in links will reach this address.",
        "",
        "Check which folder it landed in. If it is spam, mark it 'not spam' and",
        "tell colleagues to do the same — otherwise the link nobody can find is",
        "the link nobody can use.",
        "",
        "— Ekpothe",
      ].join("\n"),
    });
    ok.push(`sent a test email to ${to} — check it arrived, and which folder`);
  } catch (e) {
    problems.push(`could not send to ${to}: ${e instanceof Error ? e.message : String(e)}`);
  }
} else {
  warnings.push("no test email sent. Re-run with an address to prove delivery: node tools/preflight.mjs you@example.com");
}

report();
