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
export const AccessGate = ({
  lang, onSignedIn,
}: {
  lang: Lang;
  onSignedIn: () => void;
}) => {
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [officialName, setOfficialName] = useState("");
  const [department, setDepartment] = useState("");
  const [showOptional, setShowOptional] = useState(false);
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
        });
        const b = (await res.json()) as { ok: boolean; message: string };
        setMessage({ ok: b.ok, text: b.message });
        if (b.ok) setMode("sign-in");
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
    email.trim().length > 3 && (mode === "sign-in" || name.trim().length > 0);

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
          {busy
            ? t(mode === "register" ? "register" : "sendingLink", lang)
            : t(mode === "register" ? "register" : "sendLink", lang)}
        </button>

        <button
          className="btn ghost block"
          style={{ marginTop: 8 }}
          onClick={() => {
            setMode(mode === "register" ? "sign-in" : "register");
            setMessage(undefined);
          }}
        >
          {t(mode === "register" ? "alreadyHave" : "needAccount", lang)}
        </button>
      </div>

      <div className="card">
        <Strapline lang={lang} />
      </div>
      <p className="credit"><strong>{t("builtBy", lang)}</strong></p>
    </div>
  );
};
