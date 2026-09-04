import { useState, type ReactNode } from "react";
import { type Lang, num, t, type StringKey } from "../i18n.js";
import { AREAS, ZONES, landmarksIn } from "../../adapters/local-json/seed/zones.js";

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
 * A zone picker: choose the area, then the exact place.
 *
 * Two short lists instead of one long one — and more importantly, the second
 * step is not cosmetic. Uttara Diabari and Uttara Jashim Uddin are about four
 * kilometres apart and do not take the same road to Gulshan, so "Uttara" alone
 * would compute a route neither driver drives and price the trip from it. The
 * landmark is a real routing node; picking one is picking a different journey.
 *
 * Still a closed set throughout. The text box **filters** seeded places and
 * never creates one — free entry is what produced four spellings of a single
 * destination from one colleague in the legacy workbook (LEGACY_AUDIT.md D-04).
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
  const [filter, setFilter] = useState("");
  const [area, setArea] = useState<string | undefined>();
  const inputId = `zone-${label.replace(/\s+/g, "-").toLowerCase()}`;

  const needle = filter.trim().toLowerCase();
  const selected = value ? ZONES.find((z) => z.id === value) : undefined;

  const matches = (z: (typeof ZONES)[number]): boolean =>
    z.nameEn.toLowerCase().includes(needle) ||
    z.nameBn.includes(filter.trim()) ||
    z.aliases.some((a) => a.includes(needle));

  // Typing searches every place, landmarks included, so a colleague who knows
  // exactly where they mean can go straight there without picking an area.
  const searchHits = needle
    ? ZONES.filter((z) => z.id !== exclude && matches(z)).slice(0, VISIBLE_ZONES)
    : [];

  const areasShown = AREAS.filter((z) => z.id !== exclude && DEFAULT_ZONES.includes(z.id));
  const landmarks = area ? landmarksIn(area).filter((z) => z.id !== exclude) : [];
  const chosenArea = area ? ZONES.find((z) => z.id === area) : undefined;

  const choose = (id: string) => {
    onChange(id);
    setFilter("");
    setArea(undefined);
  };

  if (selected) {
    return (
      <div>
        <span className="label">{label}</span>
        <div className="chips">
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
      </div>
    );
  }

  return (
    <div>
      <label className="label" htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className="input"
        type="search"
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setArea(undefined);
        }}
        placeholder={lang === "en" ? "Type to search…" : "খুঁজতে লিখুন…"}
        autoComplete="off"
      />

      {needle ? (
        <div className="chips" style={{ marginTop: 11 }} role="group" aria-label={label}>
          {searchHits.map((z) => (
            <button key={z.id} type="button" className="chip" onClick={() => choose(z.id)}>
              {lang === "en" ? z.nameEn : z.nameBn}
            </button>
          ))}
          {searchHits.length === 0 && (
            <span className="hint">
              {lang === "en" ? "No place by that name." : "এই নামে কোনো জায়গা নেই।"}
            </span>
          )}
        </div>
      ) : area ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <button type="button" className="btn ghost" onClick={() => setArea(undefined)}>
              ←
            </button>
            <strong style={{ fontSize: 15 }}>
              {lang === "en" ? `Where in ${chosenArea?.nameEn}?` : `${chosenArea?.nameBn}-এর কোথায়?`}
            </strong>
          </div>
          <div className="chips" style={{ marginTop: 11 }} role="group" aria-label={label}>
            {/* Anywhere-in-the-area stays available: a colleague who does not
                mind the exact spot should not be forced to invent one. */}
            <button type="button" className="chip" onClick={() => choose(area)}>
              {lang === "en" ? `${chosenArea?.nameEn} — anywhere` : `${chosenArea?.nameBn} — যেকোনো জায়গা`}
            </button>
            {landmarks.map((z) => (
              <button key={z.id} type="button" className="chip" onClick={() => choose(z.id)}>
                {lang === "en" ? z.nameEn : z.nameBn}
              </button>
            ))}
          </div>
          <p className="hint">
            {lang === "en"
              ? "These are far enough apart to take different roads, so the route changes with your choice."
              : "এগুলো যথেষ্ট দূরে, আলাদা রাস্তা যায় — তাই আপনার পছন্দে রুট বদলে যাবে।"}
          </p>
        </>
      ) : (
        <div className="chips" style={{ marginTop: 11 }} role="group" aria-label={label}>
          {areasShown.map((z) => {
            const hasLandmarks = landmarksIn(z.id).length > 0;
            return (
              <button
                key={z.id}
                type="button"
                className={`chip${hasLandmarks ? " area" : ""}`}
                onClick={() => (hasLandmarks ? setArea(z.id) : choose(z.id))}
              >
                {lang === "en" ? z.nameEn : z.nameBn}
                {hasLandmarks && <span aria-hidden="true"> ›</span>}
              </button>
            );
          })}
        </div>
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
