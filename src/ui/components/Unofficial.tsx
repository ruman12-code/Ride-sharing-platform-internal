import { type Lang, t } from "../i18n.js";

/**
 * "Not an official system."
 *
 * Shown wherever a colleague commits to something: signing in, and publishing a
 * journey. It is not legal boilerplate to be tucked away — it protects the
 * colleague, who should know what they are joining before they join it, and the
 * person who built this, who should not be read as speaking for the employer.
 *
 * Quieter than the red disclaimer on purpose. The disclaimer is a warning about
 * what you are doing; this is context about what you are using. Two things in
 * red compete, and the louder one stops being read.
 */
export const Unofficial = ({ lang, compact = false }: { lang: Lang; compact?: boolean }) => {
  if (compact) {
    return <p className="hint"><strong>{t("unofficialShort", lang)}</strong></p>;
  }
  return (
    <div className="unofficial" role="note">
      <span className="mark-i" aria-hidden="true">ⓘ</span>
      <p>
        <strong>{t("unofficialTitle", lang)}.</strong> {t("unofficial", lang)}
      </p>
    </div>
  );
};
