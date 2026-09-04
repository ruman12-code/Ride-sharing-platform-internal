import { useEffect, useState } from "react";
import { type Lang, t } from "../i18n.js";
import { Strapline } from "../components/Strapline.jsx";
import { Unofficial } from "../components/Unofficial.jsx";
import { Wordmark } from "../components/Wordmark.jsx";

/**
 * The door.
 *
 * Ekpothe is reachable by anyone — a public URL a colleague can open on their
 * phone without an IT ticket. What is not public is access: a work email
 * address, an administrator who recognises the name, and a code issued to that
 * one person.
 *
 * Both failure paths say as little as possible. A form that answers "no such
 * colleague" differently from "wrong code" is a way of finding out who works
 * here, so it does not.
 */
export const AccessGate = ({
  lang, onSignedIn,
}: {
  lang: Lang;
  onSignedIn: () => void;
}) => {
  const [mode, setMode] = useState<"sign-in" | "request">("sign-in");
  /**
   * Whether the server wants an email address at all.
   *
   * In the pilot it does not: colleagues arrive with a code and choose a
   * display name, and no address is asked for or stored.
   */
  const [inviteOnly, setInviteOnly] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | undefined>();

  // Ask the server which mode it is in, so the form only ever requests what is
  // actually wanted.
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/request-access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ probe: true }),
    })
      .then((r) => r.json())
      .then((b: { inviteOnly?: boolean }) => {
        if (!cancelled) setInviteOnly(Boolean(b.inviteOnly));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const post = async (path: string, payload: unknown): Promise<Response> =>
    fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

  const submit = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      if (inviteOnly) {
        const res = await post("/api/sign-in", { code, displayName: name });
        if (res.ok) {
          onSignedIn();
          return;
        }
        const b = (await res.json()) as { error: string };
        setMessage({ ok: false, text: b.error });
      } else if (mode === "request") {
        const res = await post("/api/request-access", { email, displayName: name });
        const body = (await res.json()) as { ok: boolean; message: string };
        setMessage({ ok: body.ok, text: body.message });
      } else {
        const res = await post("/api/sign-in", { email, code });
        if (res.ok) {
          onSignedIn();
          return;
        }
        const body = (await res.json()) as { error: string };
        setMessage({ ok: false, text: body.error });
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
    email.trim().length > 3 && (mode === "request" ? name.trim().length > 0 : code.trim().length >= 6);

  if (inviteOnly) {
    return (
      <div className="main" style={{ paddingTop: 34 }}>
        <div style={{ marginBottom: 22 }}>
          <Wordmark lang={lang} size="hero" />
        </div>
        <p className="sub">{t("inviteOnlyBody", lang)}</p>

        <Unofficial lang={lang} />

        <div className="card raised">
          <label className="label" htmlFor="code">{t("accessCode", lang)}</label>
          <input
            id="code"
            className="input"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ letterSpacing: "0.34em", fontWeight: 700, fontSize: 20, textAlign: "center" }}
          />

          <label className="label" htmlFor="name" style={{ marginTop: 16 }}>
            {t("whatToCallYou", lang)}
          </label>
          <input
            id="name"
            className="input"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="hint">{t("nameHint", lang)}</p>
          <p className="hint"><strong>{t("noEmailNeeded", lang)}</strong></p>

          {message && (
            <div className={`notice ${message.ok ? "good" : "error"}`} style={{ marginTop: 14 }}>
              {message.text}
            </div>
          )}

          <button
            className="btn primary block"
            style={{ marginTop: 16 }}
            disabled={code.trim().length < 6 || name.trim().length === 0 || busy}
            onClick={() => void submit()}
          >
            {busy ? "…" : t("signIn", lang)}
          </button>
        </div>

        <div className="card">
          <Strapline lang={lang} />
        </div>
        <p className="credit"><strong>{t("builtBy", lang)}</strong></p>
      </div>
    );
  }

  return (
    <div className="main" style={{ paddingTop: 28 }}>
      <div style={{ marginBottom: 20 }}>
        <Wordmark lang={lang} size="hero" />
      </div>
      <p className="sub">{t("accessExplainer", lang)}</p>

      <Unofficial lang={lang} />

      <div className="card raised">
        <label className="label" htmlFor="email">{t("workEmail", lang)}</label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {mode === "request" ? (
          <>
            <label className="label" htmlFor="name" style={{ marginTop: 14 }}>
              {t("yourName", lang)}
            </label>
            <input
              id="name"
              className="input"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </>
        ) : (
          <>
            <label className="label" htmlFor="code" style={{ marginTop: 14 }}>
              {t("accessCode", lang)}
            </label>
            <input
              id="code"
              className="input"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              // Codes are read aloud and retyped, so accept any case and let
              // the field show the shape people were given.
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              style={{ letterSpacing: "0.3em", fontWeight: 600 }}
            />
          </>
        )}

        {message && (
          <div className={`notice ${message.ok ? "good" : "error"}`} style={{ marginTop: 14 }}>
            {message.text}
          </div>
        )}

        <button
          className="btn primary block"
          style={{ marginTop: 16 }}
          disabled={!canSubmit || busy}
          onClick={() => void submit()}
        >
          {busy ? "…" : t(mode === "request" ? "requestAccess" : "signIn", lang)}
        </button>

        <button
          className="btn ghost block"
          style={{ marginTop: 8 }}
          onClick={() => {
            setMode(mode === "request" ? "sign-in" : "request");
            setMessage(undefined);
          }}
        >
          {t(mode === "request" ? "haveACode" : "needACode", lang)}
        </button>
      </div>

      <div className="card">
        <Strapline lang={lang} />
      </div>

      <p className="credit"><strong>{t("builtBy", lang)}</strong></p>
    </div>
  );
};
