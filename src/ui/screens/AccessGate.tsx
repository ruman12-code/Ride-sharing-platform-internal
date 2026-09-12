import { useEffect, useState } from "react";
import { type Lang, t } from "../i18n.js";
import { Strapline } from "../components/Strapline.jsx";
import { Unofficial } from "../components/Unofficial.jsx";
import { Wordmark } from "../components/Wordmark.jsx";

/**
 * The door.
 *
 * A colleague registers themselves with a **personal** address, an
 * administrator who recognises them approves, and from then on they sign in by
 * tapping a link emailed to that address. There is no password anywhere: none
 * to invent, none to forget, and so no reset to build.
 *
 * Work addresses are refused with the reason, because reaching for your work
 * address is the natural thing to do and a colleague deserves to know why it is
 * the wrong one here rather than being told "invalid".
 *
 * Otherwise both paths say as little as possible. Asking for a link gets the
 * same reply whether or not the address has an account — anything sharper turns
 * this box into a way of finding out who works here.
 */
/**
 * What to send when somebody types a code.
 *
 * Normalised once, here, rather than on every keystroke — which is what went
 * wrong. The field used to upper-case whatever it held while it was six
 * characters or shorter, so the first six characters of *any* code were folded:
 * an administrator whose bootstrap code contained a lower-case letter sent a
 * code of exactly the right length and entirely the wrong bytes, and was told
 * only that it was not valid. That is the same silent lockout this door exists
 * to prevent, arriving by a new route.
 *
 * Six characters is a colleague's invite code. Those are minted from an
 * upper-case alphabet, so folding is safe and lets somebody type theirs in
 * lower case. Anything longer is the administrator's own bootstrap code, which
 * the server compares byte for byte, so it is passed through untouched.
 *
 * Exported because it was a conditional expression inside a JSX attribute,
 * where nothing could test it and the bug lived for two deployments.
 */
export const normaliseCode = (raw: string): string => {
  const entered = raw.trim();
  return entered.length === 6 ? entered.toUpperCase() : entered;
};

export const AccessGate = ({
  lang, onSignedIn,
}: {
  lang: Lang;
  onSignedIn: () => void;
}) => {
  /*
    Three doors, and the code is the one that always opens.

    A sign-in link needs a mail provider, and this pilot has now been stopped by
    three of them: a host that blocks SMTP, a provider that demands an SMS that
    never arrives, and an account suspended without warning. A code needs
    nobody's servers — the administrator reads it off their screen and sends it
    however they already talk to that colleague.
  */
  const [mode, setMode] = useState<"sign-in" | "register" | "code">("sign-in");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [officialName, setOfficialName] = useState("");
  const [department, setDepartment] = useState("");
  const [showOptional, setShowOptional] = useState(false);
  /*
    Never pre-ticked, and never remembered between visits. A box that arrives
    already ticked records nothing about what anybody read.
  */
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | undefined>();
  const [blocked, setBlocked] = useState<readonly string[]>([]);

  /*
    Arriving from the emailed link.

    The token is redeemed with a POST rather than by the GET that opened this
    page, because mail scanners and link previewers follow GETs and would burn
    the link before the colleague ever taps it. They do not run JavaScript, so
    doing the redemption here is what keeps the link alive for its owner.

    The token is then scrubbed from the address bar. It is spent either way,
    but a sign-in URL sitting in browser history and in the phone's share sheet
    is worth one line to avoid.
  */
  const [arriving, setArriving] = useState(
    () => typeof location !== "undefined" && location.pathname === "/enter",
  );

  useEffect(() => {
    if (!arriving) return;
    const token = new URLSearchParams(location.search).get("t") ?? "";
    void fetch("/api/session-from-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        history.replaceState(null, "", "/");
        if (res.ok) {
          onSignedIn();
          return;
        }
        setArriving(false);
        setMessage({ ok: false, text: t("linkDead", lang) });
      })
      .catch(() => {
        history.replaceState(null, "", "/");
        setArriving(false);
        setMessage({ ok: false, text: t("linkDead", lang) });
      });
  }, [arriving, lang, onSignedIn]);

  useEffect(() => {
    void fetch("/api/config")
      .then((r) => r.json())
      .then((c: { blockedDomains?: string[] }) => setBlocked(c.blockedDomains ?? []))
      .catch(() => undefined);
  }, []);

  const post = (path: string, payload: unknown): Promise<Response> =>
    fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

  const submit = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      if (mode === "register") {
        const res = await post("/api/register", {
          email,
          displayName: name,
          officialName,
          department,
          acknowledged: agreed,
        });
        const b = (await res.json()) as { ok: boolean; message: string };
        setMessage({ ok: b.ok, text: b.message });
        if (b.ok) setMode("sign-in");
      } else if (mode === "code") {
        const res = await post("/api/sign-in", { code: normaliseCode(code) });
        if (res.ok) {
          onSignedIn();
          return;
        }
        /*
          The server can distinguish "your code is right but you have no account
          yet" from "that code is nothing". Showing one message for both hid the
          only instruction that would have helped.
        */
        const b = (await res.json().catch(() => ({}))) as { reason?: string };
        setMessage({
          ok: false,
          text: t(b.reason === "no-admin-account" ? "bootstrapNeedsAccount" : "codeRejected", lang),
        });
      } else {
        const res = await post("/api/sign-in-link", { email });
        const b = (await res.json()) as { ok: boolean; message: string };
        // Deliberately the same reply either way, so this is always "ok".
        setMessage({ ok: true, text: b.message });
      }
    } catch {
      setMessage({
        ok: false,
        text: lang === "en" ? "Could not reach the server." : "সার্ভারে পৌঁছানো গেল না।",
      });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    mode === "code"
      ? code.trim().length >= 6
      : mode === "sign-in"
        ? email.trim().length > 3
        // Registering needs the confirmation as well as the details. The server
        // refuses without it either way; disabling the button is so that a
        // colleague finds out before filling the form in, not after.
        : email.trim().length > 3 && name.trim().length > 0 && agreed;

  if (arriving) {
    return (
      <div className="main" style={{ paddingTop: 32 }}>
        <div style={{ marginBottom: 20 }}>
          <Wordmark lang={lang} size="hero" />
        </div>
        <div className="card raised">
          <p style={{ margin: 0 }}>{t("signingYouIn", lang)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="main" style={{ paddingTop: 32 }}>
      <div style={{ marginBottom: 20 }}>
        <Wordmark lang={lang} size="hero" />
      </div>

      <Unofficial lang={lang} />

      <div className="card raised">
        {mode === "code" ? (
          <>
            <label className="label" htmlFor="code">{t("yourCode", lang)}</label>
            <input
              id="code"
              className="input code-input"
              autoComplete="one-time-code"
              /*
                Off, not "characters". A phone keyboard capitalising for you is
                help when the code is six letters and sabotage when it is a
                passphrase the administrator chose. Invite codes are folded to
                upper case when the form is submitted instead.
              */
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              /*
                Not capped at six. Colleagues' codes are six characters, but
                the administrator's own bootstrap code is whatever they chose
                in the environment — and a cap of six silently truncated it,
                so the one door meant to work when nothing else does could not
                be typed into at all.
              */
              maxLength={64}
              value={code}
              /*
                Kept exactly as typed. Every transformation that used to happen
                here happens once, at submission, where the whole code is
                visible and its length actually means something.
              */
              onChange={(e) => setCode(e.target.value)}
            />
            <p className="hint">{t("codeHint", lang)}</p>
          </>
        ) : (
        <>
        <label className="label" htmlFor="email">
          {mode === "register" ? t("personalEmail", lang) : t("signInEmail", lang)}
        </label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode === "register" && (
          <p className="hint">
            {t("personalEmailHint", lang)}
            {/*
              Said as a sentence rather than a bare domain. The domain used to
              be appended on its own, which read as a fragment nobody could
              act on — it looked like an example to copy rather than the one
              thing that will be refused.
            */}
            {blocked.length > 0 && (
              <>
                {" "}
                {t("blockedDomainsHint", lang).split("%s")[0]}
                <strong>{blocked.map((d) => `@${d}`).join(", ")}</strong>
                {t("blockedDomainsHint", lang).split("%s")[1]}
              </>
            )}
          </p>
        )}

        {mode === "sign-in" && <p className="hint">{t("signInLinkHint", lang)}</p>}
        {mode === "register" && (
          <>
            <label className="label" htmlFor="name" style={{ marginTop: 16 }}>
              {t("whatToCallYou", lang)}
            </label>
            <input
              id="name"
              className="input"
              autoComplete="nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="hint">{t("nameHint", lang)}</p>

            {/* Collapsed by default: optional fields presented as a wall of
                inputs read as required, and a colleague who does not want to
                give them should not have to scroll past them. */}
            <button
              type="button"
              className="toggle"
              style={{ marginTop: 10 }}
              aria-expanded={showOptional}
              onClick={() => setShowOptional((v) => !v)}
            >
              <span style={{ fontSize: 14 }}>{t("optionalSection", lang)}</span>
              <span aria-hidden="true">{showOptional ? "▴" : "▾"}</span>
            </button>

            {showOptional && (
              <div style={{ marginTop: 8 }}>
                <label className="label" htmlFor="official">{t("officialName", lang)}</label>
                <input
                  id="official"
                  className="input"
                  value={officialName}
                  onChange={(e) => setOfficialName(e.target.value)}
                />
                <label className="label" htmlFor="dept" style={{ marginTop: 12 }}>
                  {t("departmentField", lang)}
                </label>
                <input
                  id="dept"
                  className="input"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
                <p className="hint">{t("optionalHint", lang)}</p>
              </div>
            )}
          </>
        )}
        </>
        )}

        {/*
          Last thing before the button, so it is read against a form that is
          already filled in and the decision it asks for is the live one.
        */}
        {mode === "register" && (
          <label className="agree" style={{ marginTop: 16 }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                setMessage(undefined);
              }}
            />
            <span>{t("unofficialAgree", lang)}</span>
          </label>
        )}

        {message && (
          <div className={`notice ${message.ok ? "good" : "error"}`} style={{ marginTop: 16 }}>
            {message.text}
          </div>
        )}

        <button
          className="btn primary block"
          style={{ marginTop: 18 }}
          disabled={!canSubmit || busy}
          onClick={() => void submit()}
        >
          {mode === "code"
            ? t("signInWithCode", lang)
            : busy
              ? t(mode === "register" ? "register" : "sendingLink", lang)
              : t(mode === "register" ? "register" : "sendLink", lang)}
        </button>

        <button
          className="btn ghost block"
          style={{ marginTop: 8 }}
          onClick={() => {
            setMode(mode === "register" ? "sign-in" : "register");
            setMessage(undefined);
            setAgreed(false);
          }}
        >
          {t(mode === "register" ? "alreadyHave" : "needAccount", lang)}
        </button>

        {/*
          The code door, offered on every screen rather than hidden behind a
          failure. It is the one that works when nothing else does, and a
          colleague holding a code should not have to guess where to put it.
        */}
        <button
          className="btn ghost block"
          style={{ marginTop: 4 }}
          onClick={() => {
            setMode(mode === "code" ? "sign-in" : "code");
            setMessage(undefined);
          }}
        >
          {t(mode === "code" ? "useEmailInstead" : "haveCode", lang)}
        </button>
      </div>

      <div className="card">
        <Strapline lang={lang} />
      </div>
    </div>
  );
};
