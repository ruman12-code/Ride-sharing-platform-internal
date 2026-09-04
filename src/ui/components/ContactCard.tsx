import { useState } from "react";
import { type Lang, t } from "../i18n.js";
import type { App } from "../store.js";

/**
 * One number, held for one purpose.
 *
 * This is the whole answer to "how do the driver and rider actually speak?".
 * The app deliberately has no directory: colleagues cannot look each other up,
 * and nothing is imported from anywhere. A person puts one detail on file for
 * themselves, and it is released to exactly one other person at the moment a
 * seat is confirmed — recorded each time, so "who has my number?" is a
 * question with an answer rather than a shrug.
 *
 * It is asked for here rather than during registration on purpose. Signing up
 * should cost as little as possible; the number is only needed once somebody
 * has actually agreed to share a ride, and a colleague who never rides never
 * has to give one at all.
 */
export const ContactCard = ({ app, lang }: { app: App; lang: Lang }) => {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Nothing to ask for once it is on file. The number itself is never sent
  // back to the browser, so there is nothing here to display or to leak.
  if (app.identity.hasContact) return null;

  return (
    <div className="card">
      <label className="label" htmlFor="contact">{t("howToReachYou", lang)}</label>
      <input
        id="contact"
        className="input"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="01XXXXXXXXX"
        value={value}
        onChange={(e) => { setValue(e.target.value); setSaved(false); }}
      />
      <p className="hint" style={{ marginTop: 8 }}>{t("contactHint", lang)}</p>
      <button
        className="btn secondary block"
        style={{ marginTop: 12 }}
        disabled={value.trim().length < 6 || saving}
        onClick={() => {
          setSaving(true);
          void app
            .setContact("phone", value.trim())
            .then((ok) => setSaved(ok))
            .finally(() => setSaving(false));
        }}
      >
        {t("saveContact", lang)}
      </button>
      {saved && <p className="hint" style={{ marginTop: 8 }}>{t("contactSaved", lang)}</p>}
    </div>
  );
};
