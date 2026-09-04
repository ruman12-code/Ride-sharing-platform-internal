import type { Lang } from "../i18n.js";

/**
 * The mark.
 *
 * An earlier version set the name and its translation on one line — "Ekpothe on
 * one path" — which read as a name followed by a stray fragment rather than as
 * an identity.
 *
 * This locks the two scripts together instead. The glyph is two stations joined
 * by a line: the product's whole idea, and the same transit language the route
 * display uses, so the mark and the interface are recognisably one thing. The
 * Bangla sits directly under the Latin at a size that reads as part of the mark
 * rather than as a caption, because both are the name — one is not a
 * translation of the other.
 *
 * "On one path" is the *meaning*, not part of the name, so it belongs in About
 * where a colleague can read it once, not in the header where it repeats on
 * every screen.
 */
export const Wordmark = ({ lang, size = "bar" }: { lang: Lang; size?: "bar" | "hero" }) => (
  <span className={`mark ${size}`}>
    <span className="mark-glyph" aria-hidden="true">
      <svg viewBox="0 0 34 12" width="34" height="12" focusable="false">
        <line x1="5" y1="6" x2="29" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="5" cy="6" r="4" fill="currentColor" />
        <circle cx="29" cy="6" r="3.2" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
      </svg>
    </span>
    <span className="mark-words">
      {/* Both scripts, always, in both languages: the name is the pair. */}
      <span className="mark-latin">Ekpothe</span>
      <span className="mark-bangla" lang="bn">একপথে</span>
    </span>
    <span className="sr-only">{lang === "en" ? "Ekpothe" : "একপথে"}</span>
  </span>
);
