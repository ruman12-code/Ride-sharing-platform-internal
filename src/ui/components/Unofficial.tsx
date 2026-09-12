import { type Lang, t } from "../i18n.js";

/**
 * "Not an official system."
 *
 * Shown at the door, on the home screen, and beside the red disclaimer when a
 * colleague publishes a journey. It protects the colleague, who should know
 * what they are joining before they join it, and the person who built this,
 * who should not be read as speaking for the employer.
 *
 * It used to be a single quiet sentence in a dashed box, on the reasoning that
 * two loud things compete. That reasoning was wrong about which two things
 * these are: the red disclaimer is the organisation's own wording about
 * entering your details, and this is the statement that the whole app is
 * nobody's employer's. The second is the larger claim and was the smaller
 * notice, so it read as a footnote and was skipped.
 *
 * It is now a notice: brass rather than red, so the two do not read as the
 * same warning, but headed, bordered and at body size. The registration form
 * carries the same text above a box that must be ticked, which is the only
 * mechanism here that puts it in front of every single person exactly once,
 * at the moment they choose to join.
 */
export const Unofficial = ({ lang, compact = false }: { lang: Lang; compact?: boolean }) => {
  if (compact) {
    return <p className="hint"><strong>{t("unofficialShort", lang)}</strong></p>;
  }
  return (
    <div className="unofficial" role="note" aria-label={t("unofficialTitle", lang)}>
      <span className="mark-i" aria-hidden="true">ⓘ</span>
      <div>
        <span className="head">{t("unofficialTitle", lang)}</span>
        <p>{t("unofficialLead", lang)}</p>
        {/* The paragraph that does the actual work. Given its own emphasis
            because it is the part a colleague would be worst served by
            missing. */}
        <p className="sharp">{t("unofficialRisk", lang)}</p>
        <p>{t("unofficialChoice", lang)}</p>
      </div>
    </div>
  );
};
