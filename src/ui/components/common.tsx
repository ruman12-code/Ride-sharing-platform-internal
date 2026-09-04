import { useState, type ReactNode } from "react";
import { type Lang, num, t, type StringKey } from "../i18n.js";
import { ZONES } from "../store.js";

export const zoneName = (id: string, lang: Lang): string => {
  const z = ZONES.find((zone) => zone.id === id);
  if (!z) return id;
  return lang === "en" ? z.nameEn : z.nameBn;
};

export const initials = (name: string): string =>
  name.split(/\s+/).slice(0, 2).map((p) => p[0] ?? "").join("").toUpperCase();

/** `HH:MM` in the reader's own numerals. */
export const timeOf = (iso: string, lang: Lang): string => {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${num(m[1]!, lang)}:${num(m[2]!, lang)}`;
};

export const Progress = ({ step, total, lang }: { step: number; total: number; lang: Lang }) => (
  <div className="progress">
    {Array.from({ length: total }, (_, i) => (
      <span key={i} className={`dot ${i === step ? "on" : i < step ? "done" : ""}`} />
    ))}
    <span className="stepcount">
      {t("step", lang)} {num(step + 1, lang)} {t("of", lang)} {num(total, lang)}
    </span>
  </div>
);

/**
 * A zone picker: type to narrow, tap to choose.
 *
 * Still a closed set. The text box **filters** the seeded zones; it never
 * creates one, and nothing free-text is ever stored. That distinction is the
 * whole lesson of the legacy workbook, where free entry produced four spellings
 * of one destination from one person in five months (LEGACY_AUDIT.md D-04).
 *
 * The filter exists because the list is now the full zone set. With corridors
 * removed there is no natural ordering to shorten it, and 45 chips rendered
 * twice made the route screen nearly 6,000px tall on a 360px phone — which is
 * its own kind of friction, and the exact thing this product exists to remove.
 */
export const ZonePicker = ({
  value, onChange, lang, exclude, label, recent = [],
}: {
  value: string | undefined;
  onChange: (id: string) => void;
  lang: Lang;
  exclude?: string | undefined;
  label: string;
  recent?: readonly string[];
}) => {
  const [filter, setFilter] = useState("");
  const inputId = `zone-${label.replace(/\s+/g, "-").toLowerCase()}`;

  const available = ZONES.filter((z) => z.id !== exclude);
  const needle = filter.trim().toLowerCase();

  // Aliases are searched too, so a colleague typing "Empori" finds Gulshan-2 —
  // the spelling they already use, resolving to the zone we store.
  const matches = needle
    ? available.filter(
        (z) =>
          z.nameEn.toLowerCase().includes(needle) ||
          z.nameBn.includes(filter.trim()) ||
          z.aliases.some((a) => a.includes(needle)),
      )
    : available.filter((z) => recent.includes(z.id) || DEFAULT_ZONES.includes(z.id));

  const selected = value ? ZONES.find((z) => z.id === value) : undefined;
  const shown = matches.slice(0, VISIBLE_ZONES);

  return (
    <div>
      <label className="label" htmlFor={inputId}>{label}</label>

      {selected && (
        <div className="chips" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className="chip"
            aria-pressed={true}
            onClick={() => onChange("")}
            aria-label={`${label}: ${selected.nameEn}, tap to change`}
          >
            {lang === "en" ? selected.nameEn : selected.nameBn} ✕
          </button>
        </div>
      )}

      {!selected && (
        <>
          <input
            id={inputId}
            className="input"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={lang === "en" ? "Type to search…" : "খুঁজতে লিখুন…"}
            autoComplete="off"
          />
          <div className="chips" style={{ marginTop: 10 }} role="group" aria-label={label}>
            {shown.map((z) => (
              <button
                key={z.id}
                type="button"
                className="chip"
                aria-pressed={value === z.id}
                onClick={() => {
                  onChange(z.id);
                  setFilter("");
                }}
              >
                {lang === "en" ? z.nameEn : z.nameBn}
              </button>
            ))}
            {shown.length === 0 && (
              <span className="hint">
                {lang === "en" ? "No place by that name." : "এই নামে কোনো জায়গা নেই।"}
              </span>
            )}
          </div>
          {matches.length > shown.length && (
            <p className="hint">
              {lang === "en"
                ? `${matches.length - shown.length} more — keep typing to narrow.`
                : `আরও ${num(matches.length - shown.length, lang)}টি — লিখতে থাকুন।`}
            </p>
          )}
        </>
      )}
    </div>
  );
};

/** How many chips to show at once, so the page stays a phone screen tall. */
const VISIBLE_ZONES = 10;

/**
 * Shown before the colleague types anything.
 *
 * Not a corridor list — routing never touches this. It is only a starting set
 * for the picker, drawn from the office locations and the busiest residential
 * areas in the legacy data.
 */
const DEFAULT_ZONES: readonly string[] = [
  "gulshan-2", "gulshan-1", "uttara", "banani", "mirpur-10",
  "dhanmondi", "mohakhali", "khilkhet", "bashundhara", "mohammadpur",
];

export const Stepper = ({
  value, min, max, onChange, ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  ariaLabel: string;
}) => (
  <div className="stepper">
    <button
      type="button"
      onClick={() => onChange(Math.max(min, value - 1))}
      disabled={value <= min}
      aria-label={`${ariaLabel}: decrease`}
    >
      −
    </button>
    <output className="value" aria-live="polite">{value}</output>
    <button
      type="button"
      onClick={() => onChange(Math.min(max, value + 1))}
      disabled={value >= max}
      aria-label={`${ariaLabel}: increase`}
    >
      +
    </button>
  </div>
);

export const Toggle = ({
  on, onChange, children,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) => (
  <button type="button" className="toggle" aria-pressed={on} onClick={() => onChange(!on)}>
    <span>{children}</span>
    <span className="switch" aria-hidden="true" />
  </button>
);

export const Sheet = ({
  onClose, children, titleId,
}: {
  onClose: () => void;
  children: ReactNode;
  titleId: string;
}) => (
  <div
    className="scrim"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <div className="sheet">
      <div className="grab" />
      {children}
    </div>
  </div>
);

export const T = ({ k, lang }: { k: StringKey; lang: Lang }) => <>{t(k, lang)}</>;
