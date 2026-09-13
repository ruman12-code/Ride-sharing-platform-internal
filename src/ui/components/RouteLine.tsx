import { type Lang, t } from "../i18n.js";
import { zoneName } from "./common.jsx";

/**
 * A route, drawn as a transit line.
 *
 * A row of pills makes a colleague read left to right and work out which places
 * are endpoints and which are stops along the way. A line with stations on it
 * answers that at a glance, which is the whole job: where can I get on, and
 * where does this go.
 *
 * Endpoints are filled markers, intermediate stops are hollow, and a stop the
 * driver has switched off is struck through — so "I do not stop there" reads
 * differently from "that is not on my route".
 */
export interface RouteStop {
  readonly zoneId: string;
  readonly isEnd: boolean;
  /** False when the driver has chosen not to stop here. */
  readonly active: boolean;
}

export const RouteLine = ({
  stops, lang, onToggle, subtitleFor,
}: {
  stops: readonly RouteStop[];
  lang: Lang;
  /** Omit to render read-only, as riders see it. */
  onToggle?: (zoneId: string) => void;
  subtitleFor?: (zoneId: string) => string | undefined;
}) => (
  <div className="routeline">
    {stops.map((s) => {
      const classes = `stop${s.isEnd ? " end" : ""}${s.active ? "" : " off"}`;
      const label = zoneName(s.zoneId, lang);
      const subtitle = subtitleFor?.(s.zoneId);

      // Endpoints are not toggleable: a driver cannot decline to stop where
      // their own journey begins and ends.
      if (!onToggle || s.isEnd) {
        return (
          <div className={classes} key={s.zoneId}>
            <span className="marker" aria-hidden="true" />
            <span className="name">
              {label}
              {subtitle && <span className="hint" style={{ margin: 0 }}> · {subtitle}</span>}
            </span>
          </div>
        );
      }

      /*
        A tick alone read as a status badge, not a control.

        Every stop arrives switched on, so the whole line was ticks — and a
        column of ticks says "this is what we found", not "tap to change this".
        Colleagues did not know the stops were theirs to remove, which is the
        one thing this screen exists for.

        So an active stop now carries the tick *and* a cross: the tick says it
        is on, the cross says what tapping does. An inactive one shows a plus,
        which was already the case and was never the half that confused anybody.
      */
      return (
        <div className={classes} key={s.zoneId}>
          <span className="marker" aria-hidden="true" />
          <button
            type="button"
            className="stopbtn"
            aria-pressed={s.active}
            aria-label={`${label} — ${t(s.active ? "stoppingTapToRemove" : "notStoppingTapToAdd", lang)}`}
            onClick={() => onToggle(s.zoneId)}
          >
            <span className="name">{label}</span>
            {s.active ? (
              <>
                <span className="tick" aria-hidden="true">✓</span>
                <span className="dropstop" aria-hidden="true">✕</span>
              </>
            ) : (
              <span className="tick add" aria-hidden="true">＋</span>
            )}
          </button>
        </div>
      );
    })}
  </div>
);
