import { useState } from "react";
import { type Lang, t } from "../i18n.js";
import { Strapline } from "../components/Strapline.jsx";

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
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | undefined>();

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
      if (mode === "request") {
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

  return (
    <div className="main" style={{ paddingTop: 28 }}>
      <h2 className="h2">{t("appName", lang)}</h2>
      <p className="sub">{t("accessExplainer", lang)}</p>

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
