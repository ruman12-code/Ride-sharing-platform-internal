import type { ReactNode } from "react";
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
 * A zone picker. Always a closed set of chips — never a text input.
 *
 * The legacy workbook allowed free text and one poster produced four spellings
 * of a single destination in five months, none of which could match each other
 * (LEGACY_AUDIT.md D-04).
 */
export const ZonePicker = ({
  value, onChange, lang, exclude, label,
}: {
  value: string | undefined;
  onChange: (id: string) => void;
  lang: Lang;
  exclude?: string | undefined;
  label: string;
}) => {
  // Corridor zones first — they cover the overwhelming majority of journeys.
  const ordered = [...ZONES].sort((a, b) => b.corridorIds.length - a.corridorIds.length);
  return (
    <div>
      <span className="label">{label}</span>
      <div className="chips" role="group" aria-label={label}>
        {ordered
          .filter((z) => z.id !== exclude)
          .map((z) => (
            <button
              key={z.id}
              type="button"
              className="chip"
              aria-pressed={value === z.id}
              onClick={() => onChange(z.id)}
            >
              {lang === "en" ? z.nameEn : z.nameBn}
            </button>
          ))}
      </div>
    </div>
  );
};

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
