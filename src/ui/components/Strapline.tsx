import { type Lang, t } from "../i18n.js";

/**
 * The strapline.
 *
 * In English the five opening letters spell the name of the colleague who built
 * this. It is meant to be noticed by whoever looks, and to read as ordinary
 * product copy to everyone else — so each line has to stand on its own as a
 * reason to use the thing, not as filler bent around a letter.
 *
 * There is no Bangla equivalent, deliberately. রুমান is র-উ-ম-া-ন, and া is a
 * vowel sign that cannot begin a word, so the device is not reproducible in
 * Bangla script. Forcing it would produce bad Bangla in exchange for a trick
 * nobody would see, so the Bangla strapline is simply good copy that says the
 * same thing.
 */
const ACROSTIC: readonly { readonly initial: string; readonly rest: string }[] = [
  { initial: "R", rest: "ide together, not alone." },
  { initial: "U", rest: "se one car instead of three." },
  { initial: "M", rest: "eet the colleagues you never see." },
  { initial: "A", rest: "rrive on time, more often." },
  { initial: "N", rest: "o fares — just fuel, shared fairly." },
];

export const Strapline = ({ lang }: { lang: Lang }) => {
  if (lang === "bn") {
    return <p className="strapline-bn">{t("straplineBn", lang)}</p>;
  }
  return (
    <ul className="strapline" aria-label="What Ekpothe is for">
      {ACROSTIC.map((line) => (
        <li key={line.initial}>
          <span className="lead" aria-hidden="true">{line.initial}</span>
          {/*
            Screen readers get the whole word, not a letter then a fragment,
            so the visual device never costs anyone the sentence.
          */}
          <span className="sr-only">{line.initial}{line.rest}</span>
          <span aria-hidden="true">{line.rest}</span>
        </li>
      ))}
    </ul>
  );
};
