import { useEffect, useMemo, useState } from "react";
import type { DayOfWeek } from "../../domain/types.js";
import type { Ride } from "../../domain/entities/ride.js";
import type { Route } from "../../domain/matching/geo.js";
import {
  IN_KIND_SUGGESTIONS,
  MAX_IN_KIND_NOTE,
  type Contribution,
  contributionLabel,
  isValidContribution,
  recommendedContribution,
} from "../../domain/pricing/contribution.js";
import { RouteLine, type RouteStop } from "../components/RouteLine.jsx";
import { Unofficial } from "../components/Unofficial.jsx";
import { validatePublish } from "../../domain/policy/invariants.js";
import { type Lang, num, t, taka } from "../i18n.js";
import { Progress, Stepper, Toggle, ZonePicker, zoneName } from "../components/common.jsx";
import { ACTIVE_FUEL_PRICE, ME, defaultRideDate, explain, shareFor, type App } from "../store.js";

/**
 * The driver's four screens: Route, When, Seats & car, Cost share.
 *
 * One question per screen, progress dots, back always available. The target is
 * under 30 seconds for a first post and under 10 for a repeat — which is why
 * saved routes appear first as a single tap, and why "Repeat weekly" is
 * prominent rather than tucked away as an advanced option.
 */

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const STEP_TITLES = ["route", "when", "seatsAndCar", "costShare"] as const;

/** Map a computed sequence plus the driver's chosen stops onto the transit line. */
const routeStops = (
  sequence: readonly string[],
  active: readonly string[],
): readonly RouteStop[] =>
  sequence.map((zoneId, i) => ({
    zoneId,
    isEnd: i === 0 || i === sequence.length - 1,
    active: active.includes(zoneId),
  }));
const WORKING_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4];

/** A route this driver has posted before. One tap replaces four screens. */
interface SavedRoute {
  readonly origin: string;
  readonly destination: string;
  readonly time: string;
}

const SAVED: readonly SavedRoute[] = [
  { origin: "uttara", destination: "gulshan-2", time: "07:45" },
];

export const OfferFlow = ({
  app, lang, onDone, onCancel,
}: {
  app: App;
  lang: Lang;
  onDone: () => void;
  onCancel: () => void;
}) => {
  const [step, setStep] = useState(0);
  const [origin, setOrigin] = useState<string | undefined>();
  const [destination, setDestination] = useState<string | undefined>();
  const [via, setVia] = useState<readonly string[]>([]);
  const [viaTouched, setViaTouched] = useState(false);
  const [time, setTime] = useState("07:45");
  // Defaults to tomorrow: a departure earlier today is unbookable, and the
  // common case is arranging tomorrow morning.
  const [date, setDate] = useState(defaultRideDate);
  const [repeat, setRepeat] = useState(true);
  const [days, setDays] = useState<readonly DayOfWeek[]>(WORKING_DAYS);
  const [seats, setSeats] = useState(2);
  const [model, setModel] = useState("Toyota Axio");
  const [colour, setColour] = useState("Silver");
  const [plate, setPlate] = useState("4417");
  const [prefs, setPrefs] = useState({ womenOnly: false, ac: true, luggage: false, quiet: false });
  const [contribution, setContribution] = useState<Contribution | undefined>();
  const [inKindNote, setInKindNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [route, setRoute] = useState<Route | undefined>();
  const [routing, setRouting] = useState(false);
  /**
   * The driver has seen the computed route and accepted it.
   *
   * Until then the stop chips stay hidden. Showing the whole zone set before a
   * route exists made the screen 5,912px tall and asked the driver to reason
   * about places that had nothing to do with their journey.
   */
  const [routeApproved, setRouteApproved] = useState(false);

  // The route is computed between whatever two zones the driver picked. There
  // is no corridor list, so a journey nobody anticipated works exactly as well
  // as the ones everybody expected.
  //
  // Every zone on the returned route is a legitimate boarding or alighting
  // point, which is what lets a rider join partway along.
  useEffect(() => {
    if (!origin || !destination) {
      setRoute(undefined);
      return;
    }
    let cancelled = false;
    setRouting(true);
    void app.planRoute(origin, destination).then((r) => {
      if (cancelled) return;
      setRoute(r);
      setRouting(false);
      // A fresh pair of endpoints means the previous approval and hand-edit no
      // longer apply; keeping either would publish stops from another journey.
      setViaTouched(false);
      setRouteApproved(false);
    });
    return () => {
      cancelled = true;
    };
  }, [app, origin, destination]);

  const suggested = useMemo(
    () => (route ? route.zoneSequence.slice(1, -1) : []),
    [route],
  );
  const effectiveVia = viaTouched ? via : suggested;

  // Distance comes from the planner. When the driver removes a stop the route
  // shortens, so the figure is scaled by the fraction of stops kept rather than
  // left overstating a journey that is no longer being made.
  const distanceKm = useMemo(() => {
    if (!route) return 0;
    if (!viaTouched || suggested.length === 0) return route.distanceKm;
    const kept = (effectiveVia.length + 2) / (suggested.length + 2);
    return Math.max(1, Math.round(route.distanceKm * kept * 10) / 10);
  }, [route, viaTouched, suggested.length, effectiveVia.length]);
  // Guarded on distance.
  //
  // The pricing domain rejects a non-positive distance rather than quietly
  // producing a nonsense cost share, which is correct. But the route resolves
  // asynchronously, so for the first render after picking two zones there is no
  // distance yet — and calling straight through threw, white-screening the whole
  // offer flow. The domain was right; the caller was wrong to ask.
  const breakdown = useMemo(
    () => (distanceKm > 0 ? shareFor(distanceKm, seats) : undefined),
    [distanceKm, seats],
  );
  const working = useMemo(
    () => (distanceKm > 0 ? explain(distanceKm, seats) : undefined),
    [distanceKm, seats],
  );
  const cap = breakdown?.sharePerSeat ?? 0;
  // Defaults to the recommended even split. Most drivers accept the default,
  // which is exactly why the default has to be the fair one.
  const chosen: Contribution = contribution ?? recommendedContribution(cap);
  const chosenShare = chosen.mode === "cost_share" ? chosen.amount : 0;

  const applySaved = (r: SavedRoute) => {
    setOrigin(r.origin);
    setDestination(r.destination);
    setTime(r.time);
    setViaTouched(false);
    setStep(3); // straight to the cost share: the repeat path
  };

  const publish = () => {
    if (!breakdown || !origin || !destination) return;
    if (!isValidContribution(chosen, cap)) {
      setError(
        lang === "en"
          ? "Say what you'd like in return, or choose 'nothing at all'."
          : "বিনিময়ে কী চান লিখুন, অথবা \u201cকিছুই না\u201d বেছে নিন।",
      );
      return;
    }
    const departureAt = `${date}T${time}:00+06:00`;
    const check = validatePublish(
      { departureAt, costSharePerSeat: chosenShare, seatsTotal: seats },
      cap,
      app.myRides.length,
      "2026-09-03T21:00:00+06:00",
    );
    if (!check.ok) {
      setError(check.error.message);
      return;
    }
    const ride: Ride = {
      id: `r-${Date.now()}`,
      driverId: ME.id,
      zoneSequence: [origin, ...effectiveVia, destination],
      departureAt,
      seatsTotal: seats,
      seatsAvailable: seats,
      costSharePerSeat: chosenShare,
      fuelPriceId: ACTIVE_FUEL_PRICE.id,
      fuelRatePerKm: breakdown.fuelRatePerKm,
      distanceKm,
      pickupPoints: [origin, ...effectiveVia].map((zid) => ({
        zoneId: zid,
        label: `${zoneName(zid, "en")} main road`,
        walkingMinutes: 4,
      })),
      vehicle: { type: "car", model, colour, plateLast4: plate, ratedKmPerLitre: 12, fuelType: "octane" },
      preferences: prefs,
      status: "published",
      rowVersion: 1,
    };
    // Report a refusal instead of navigating away as though it worked.
    void Promise.resolve(app.publish(ride)).then((published) => {
      if (published === false) {
        setError(
          lang === "en"
            ? "That could not be published. Check the departure is in the future."
            : "প্রকাশ করা গেল না। সময়টি ভবিষ্যতে আছে কিনা দেখুন।",
        );
        return;
      }
      onDone();
    });
  };

  const canNext = [
    Boolean(origin && destination && route && !routing && routeApproved),
    Boolean(time),
    seats >= 1,
    true,
  ][step];

  return (
    <div>
      {/*
        The declaration from the legacy entry form, kept word for word and put
        where it cannot be missed: above the fields, on every step, never
        collapsible. It is the organisation's own wording.
      */}
      <div className="disclaimer" role="note" aria-label={t("disclaimerHeading", lang)}>
        <span className="mark" aria-hidden="true">⚠️</span>
        <div>
          <span className="head">{t("disclaimerHeading", lang)}</span>
          <p>{t("declaration", lang)}</p>
        </div>
      </div>

      {/* Beside the disclaimer, because publishing a journey is the moment a
          colleague is most entitled to know what they are publishing it into. */}
      <Unofficial lang={lang} />

      <Progress step={step} total={4} lang={lang} />
      <h2 className="h2">{t(STEP_TITLES[step]!, lang)}</h2>

      {step === 0 && (
        <>
          {SAVED.length > 0 && (
            <>
              <p className="section-title">{t("savedRoutes", lang)}</p>
              {SAVED.map((r) => (
                <button key={r.origin + r.destination} className="bigcard" onClick={() => applySaved(r)}>
                  <span className="icon" aria-hidden="true">↻</span>
                  <span>
                    <span className="t">
                      {zoneName(r.origin, lang)} → {zoneName(r.destination, lang)}
                    </span>
                    <span className="d">{num(r.time, lang)} · {t("repeatWeekly", lang)}</span>
                  </span>
                </button>
              ))}
            </>
          )}

          <div className="card">
            <ZonePicker value={origin} onChange={setOrigin} lang={lang} exclude={destination} label={t("from", lang)} />
          </div>
          <div className="card">
            <ZonePicker value={destination} onChange={setDestination} lang={lang} exclude={origin} label={t("to", lang)} />
          </div>

          {origin && destination && (
            <div className="card">
              {routing && (
                <>
                  <span className="label">{t("calculatingRoute", lang)}</span>
                  <div className="skel" style={{ height: 72 }} aria-live="polite" />
                </>
              )}

              {!routing && !route && <p className="notice warn">{t("noRoute", lang)}</p>}

              {/* Phase 1: the computed route, for the driver to accept. */}
              {!routing && route && !routeApproved && (
                <>
                  <span className="label">{t("suggestedRoute", lang)}</span>
                  <RouteLine lang={lang} stops={routeStops(route.zoneSequence, route.zoneSequence)} />
                  <div className="routemeta">
                    <span>
                      <span className="big">{num(route.distanceKm, lang)}</span>{" "}
                      <span className="unit">km</span>
                    </span>
                    <span>
                      <span className="big">{num(route.durationMinutes, lang)}</span>{" "}
                      <span className="unit">{t("minutes", lang)}</span>
                    </span>
                    <span className="badge muted" style={{ marginInlineStart: "auto" }}>
                      {route.isEstimate ? t("estimated", lang) : t("liveTraffic", lang)}
                    </span>
                  </div>
                  <button
                    className="btn primary block"
                    style={{ marginTop: 14 }}
                    onClick={() => setRouteApproved(true)}
                  >
                    {t("useThisRoute", lang)}
                  </button>
                  <button
                    className="btn ghost block"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      setOrigin(undefined);
                      setDestination(undefined);
                    }}
                  >
                    {t("changePoints", lang)}
                  </button>
                </>
              )}

              {/*
                Phase 2: stops, scoped to the approved route.
                Only places the driver actually passes are offered, so the list
                is a handful rather than the whole zone set, and every chip is a
                decision that means something.
              */}
              {!routing && route && routeApproved && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="badge exact_route">✓ {t("approvedRoute", lang)}</span>
                    <button className="btn ghost" onClick={() => setRouteApproved(false)}>
                      {t("editRoute", lang)}
                    </button>
                  </div>
                  <div className="meta" style={{ marginTop: 8 }}>
                    <span><strong>{num(distanceKm, lang)} km</strong></span>
                    <span>~{num(route.durationMinutes, lang)} {t("minutes", lang)}</span>
                    <span>
                      {num(effectiveVia.length, lang)} {t("stopsChosen", lang)}
                    </span>
                  </div>

                  <span className="label" style={{ marginTop: 18 }}>{t("pickYourStops", lang)}</span>
                  <RouteLine
                    lang={lang}
                    stops={routeStops(route.zoneSequence, [origin, ...effectiveVia, destination])}
                    onToggle={(zid) => {
                      setViaTouched(true);
                      setVia(
                        effectiveVia.includes(zid)
                          ? effectiveVia.filter((v) => v !== zid)
                          : suggested.filter((z) => effectiveVia.includes(z) || z === zid),
                      );
                    }}
                  />

                  {suggested.length > 0 && (
                    <div className="btnrow" style={{ marginTop: 10 }}>
                      <button
                        className="btn ghost"
                        onClick={() => { setViaTouched(true); setVia(suggested); }}
                      >
                        {t("allStops", lang)}
                      </button>
                      <button
                        className="btn ghost"
                        onClick={() => { setViaTouched(true); setVia([]); }}
                      >
                        {t("noStops", lang)}
                      </button>
                    </div>
                  )}
                  <p className="hint">{t("pickYourStopsHint", lang)}</p>
                </>
              )}
            </div>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <div className="card">
            <label className="label" htmlFor="date">{t("when", lang)}</label>
            <input
              id="date"
              className="input"
              type="date"
              value={date}
              min={new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
            <label className="label" htmlFor="time" style={{ marginTop: 14 }}>
              {t("departureTime", lang)}
            </label>
            <input
              id="time"
              className="input"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="card">
            <Toggle on={repeat} onChange={setRepeat}>
              <strong>{t("repeatWeekly", lang)}</strong>
            </Toggle>
            <p className="hint">{t("repeatWeeklyHint", lang)}</p>
            {repeat && (
              <div className="chips" style={{ marginTop: 12 }} role="group" aria-label={t("repeatWeekly", lang)}>
                {DAY_KEYS.map((k, i) => (
                  <button
                    key={k}
                    type="button"
                    className="chip small"
                    aria-pressed={days.includes(i as DayOfWeek)}
                    onClick={() =>
                      setDays((d) =>
                        d.includes(i as DayOfWeek)
                          ? d.filter((x) => x !== i)
                          : [...d, i as DayOfWeek].sort(),
                      )
                    }
                  >
                    {t(k, lang)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="card">
            <span className="label">{t("seatsOffered", lang)}</span>
            {/* A stepper, never a text field: the legacy sheet holds "plenty". */}
            <Stepper value={seats} min={1} max={6} onChange={setSeats} ariaLabel={t("seatsOffered", lang)} />
          </div>
          <div className="card">
            <span className="label">{t("vehicle", lang)}</span>
            <input className="input" value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model" style={{ marginBottom: 8 }} />
            <input className="input" value={colour} onChange={(e) => setColour(e.target.value)} aria-label="Colour" style={{ marginBottom: 8 }} />
            <input className="input" value={plate} maxLength={4} onChange={(e) => setPlate(e.target.value)} aria-label="Plate, last 4" />
          </div>
          <div className="card">
            <span className="label">{t("preferences", lang)}</span>
            <Toggle on={prefs.womenOnly} onChange={(v) => setPrefs({ ...prefs, womenOnly: v })}>{t("womenOnly", lang)}</Toggle>
            <Toggle on={prefs.ac} onChange={(v) => setPrefs({ ...prefs, ac: v })}>{t("ac", lang)}</Toggle>
            <Toggle on={prefs.luggage} onChange={(v) => setPrefs({ ...prefs, luggage: v })}>{t("luggage", lang)}</Toggle>
            <Toggle on={prefs.quiet} onChange={(v) => setPrefs({ ...prefs, quiet: v })}>{t("quiet", lang)}</Toggle>
          </div>
        </>
      )}

      {step === 3 && !working && (
        <div className="card">
          <p className="notice warn" style={{ margin: 0 }}>{t("noRoute", lang)}</p>
        </div>
      )}

      {step === 3 && working && breakdown && (
        <>
          <div className="card">
            {/* The working is always shown. A number nobody can explain is a
                number nobody trusts, and this one has to survive scrutiny. */}
            <div className="working">
              {working.calculation}
              <div style={{ marginTop: 6, fontWeight: 600 }}>{working.recovery}</div>
              <div className="prov">{working.provenance}</div>
            </div>

            {/*
              The system always works out an even fuel share and always shows
              it. What it does not do is insist. A colleague giving another
              colleague a lift may want the fuel, may prefer a coffee, or may
              want nothing — and forcing the first turns a favour into a
              transaction. The calculated share stays the ceiling in every mode.
            */}
            <div style={{ marginTop: 18 }}>
              <span className="label">{t("whatDoYouAsk", lang)}</span>
              <div className="chips" role="group" aria-label={t("whatDoYouAsk", lang)}>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={chosen.mode === "cost_share"}
                  onClick={() => setContribution(recommendedContribution(cap))}
                >
                  {t("modeCostShare", lang)}
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={chosen.mode === "in_kind"}
                  onClick={() =>
                    setContribution({
                      mode: "in_kind",
                      amount: 0,
                      inKindNote: inKindNote || IN_KIND_SUGGESTIONS[0]!,
                    })
                  }
                >
                  {t("modeInKind", lang)}
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={chosen.mode === "nothing"}
                  onClick={() => setContribution({ mode: "nothing", amount: 0 })}
                >
                  {t("modeNothing", lang)}
                </button>
              </div>
              <p className="hint">{t("contributionHint", lang)}</p>

              {chosen.mode === "cost_share" && (
                <div style={{ marginTop: 14 }}>
                  <span className="label">
                    {taka(chosenShare, lang)} {t("perSeat", lang)}
                    <span className="badge exact_route" style={{ marginInlineStart: 8 }}>
                      {t("recommended", lang)}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={cap}
                    step={10}
                    value={chosenShare}
                    onChange={(e) =>
                      setContribution({ mode: "cost_share", amount: Number(e.target.value) })
                    }
                    aria-label={t("costShare", lang)}
                  />
                  <p className="hint">{t("youMayLower", lang)}</p>
                  <p className="hint"><strong>{t("capNotice", lang)}</strong> {taka(cap, lang)}</p>
                </div>
              )}

              {chosen.mode === "in_kind" && (
                <div style={{ marginTop: 14 }}>
                  <div className="chips">
                    {IN_KIND_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="chip small"
                        aria-pressed={chosen.inKindNote === suggestion}
                        onClick={() => {
                          setInKindNote(suggestion);
                          setContribution({ mode: "in_kind", amount: 0, inKindNote: suggestion });
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                  <input
                    className="input"
                    style={{ marginTop: 10 }}
                    maxLength={MAX_IN_KIND_NOTE}
                    value={inKindNote}
                    placeholder={t("inKindPlaceholder", lang)}
                    aria-label={t("modeInKind", lang)}
                    onChange={(e) => {
                      setInKindNote(e.target.value);
                      setContribution({ mode: "in_kind", amount: 0, inKindNote: e.target.value });
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <p className="section-title" style={{ marginTop: 0 }}>{t("review", lang)}</p>
            <div style={{ fontSize: 17, fontWeight: 650 }}>
              {zoneName(origin!, lang)} → {zoneName(destination!, lang)}
            </div>
            <div className="meta">
              <span>{num(time, lang)}</span>
              <span>{num(seats, lang)} {t(seats === 1 ? "seatLeft" : "seatsLeft", lang).replace(/ left| বাকি/, "")}</span>
              {/* Rendered through contributionLabel so a coffee never appears
                  as "Tk 0" — a zero price is still a price, and it frames a
                  favour as a transaction that happens to cost nothing. */}
              <span>{contributionLabel(chosen, lang)}</span>
            </div>
            {effectiveVia.length > 0 && (
              <div className="meta">
                <span>{t("passingThrough", lang)} {effectiveVia.map((z) => zoneName(z, lang)).join(" · ")}</span>
              </div>
            )}
          </div>

          {error && <div className="notice error">{error}</div>}
        </>
      )}

      <div className="btnrow">
        <button className="btn ghost" onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
          {t(step === 0 ? "cancel" : "back", lang)}
        </button>
        {step < 3 ? (
          <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
            {t("next", lang)}
          </button>
        ) : (
          <button className="btn primary" onClick={publish}>{t("publish", lang)}</button>
        )}
      </div>
    </div>
  );
};
