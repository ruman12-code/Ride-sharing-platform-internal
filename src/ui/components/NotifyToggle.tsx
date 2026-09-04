import { useEffect, useState } from "react";
import { type Lang, t } from "../i18n.js";
import { disablePush, enablePush, pushState, type PushState } from "../push.js";

/**
 * Turning on notifications.
 *
 * Placed where a colleague will meet it early and asked for only on a tap —
 * never on load. A permission prompt that appears before somebody knows what
 * the app is gets dismissed, and a dismissal is close to permanent: the browser
 * will not ask again, and that colleague then never hears that somebody wants a
 * seat.
 *
 * The copy says *why* rather than "enable notifications", because the reason is
 * the persuasive part: a driver who never checks is a colleague left standing
 * at a pickup point.
 */
export const NotifyToggle = ({ lang }: { lang: Lang }) => {
  const [state, setState] = useState<PushState | "loading">("loading");
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushState().then(setState);
    void fetch("/api/config")
      .then((r) => r.json())
      .then((c: { pushKey?: string | null }) => setKey(c.pushKey ?? null))
      .catch(() => undefined);
  }, []);

  if (state === "loading") return null;

  // Without server keys there is nothing to subscribe to; email still reaches
  // them, so saying nothing is better than offering a button that cannot work.
  if (!key && state !== "on") return null;

  if (state === "unsupported") {
    return (
      <div className="card">
        <p className="hint" style={{ margin: 0 }}>{t("notifyUnsupported", lang)}</p>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="card">
        <span className="label">{t("notifications", lang)}</span>
        <div className="notice warn">{t("notifyDenied", lang)}</div>
      </div>
    );
  }

  return (
    <div className="card">
      <span className="label">{t("notifications", lang)}</span>
      {state === "on" ? (
        <>
          <div className="notice good">✓ {t("notifyOn", lang)}</div>
          <button
            className="btn ghost block"
            style={{ marginTop: 10 }}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void disablePush().then(setState).finally(() => setBusy(false));
            }}
          >
            {lang === "en" ? "Turn off" : "বন্ধ করুন"}
          </button>
        </>
      ) : (
        <>
          <p className="hint" style={{ marginTop: 0 }}>{t("notifyWhy", lang)}</p>
          <button
            className="btn primary block"
            style={{ marginTop: 12 }}
            disabled={busy || !key}
            onClick={() => {
              setBusy(true);
              void enablePush(key!).then(setState).finally(() => setBusy(false));
            }}
          >
            {busy ? "…" : t("notifyOff", lang)}
          </button>
        </>
      )}
    </div>
  );
};
