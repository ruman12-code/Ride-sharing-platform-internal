import { useMemo, useState } from "react";
import type { DayOfWeek } from "../../domain/types.js";
import type { Ride } from "../../domain/entities/ride.js";
import { suggestViaZones } from "../../adapters/local-json/seed/zones.js";
import { validatePublish } from "../../domain/policy/invariants.js";
import { type Lang, num, t, taka } from "../i18n.js";
import { Progress, Stepper, Toggle, ZonePicker, zoneName } from "../components/common.jsx";
import { ACTIVE_FUEL_PRICE, ME, explain, shareFor, type App } from "../store.js";

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
  const [repeat, setRepeat] = useState(true);
  const [days, setDays] = useState<readonly DayOfWeek[]>(WORKING_DAYS);
  const [seats, setSeats] = useState(2);
  const [model, setModel] = useState("Toyota Axio");
  const [colour, setColour] = useState("Silver");
  const [plate, setPlate] = useState("4417");
  const [prefs, setPrefs] = useState({ womenOnly: false, ac: true, luggage: false, quiet: false });
  const [share, setShare] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();

  // Pre-populate the via zones from the corridor graph the moment both ends are
  // known. The legacy Route column was blank in 13 of 20 rows because the submit
  // handler silently dropped it (L-03) — a suggestion the driver confirms is
  // both faster than typing and verifiable end to end.
  const suggested = useMemo(
    () => (origin && destination ? suggestViaZones(origin, destination) : []),
    [origin, destination],
  );
  const effectiveVia = viaTouched ? via : suggested;

  // Distance stands in for a routing call, which Phase 1 does not make: roughly
  // 6 km between endpoints plus 2.5 km per intermediate stop. It must be based
  // on the stops actually being published, not on the `via` state — those differ
  // until the driver edits the suggestion, and reading the wrong one priced a
  // 7-stop Uttara-Gulshan run as a 6 km trip.
  //
  // Crude on purpose, and replaced wholesale when a geocoder adapter lands.
  const distanceKm = useMemo(() => 6 + effectiveVia.length * 2.5, [effectiveVia.length]);
  const breakdown = useMemo(() => shareFor(distanceKm, seats), [distanceKm, seats]);
  const working = useMemo(() => explain(distanceKm, seats), [distanceKm, seats]);
  const cap = breakdown.sharePerSeat;
  const chosenShare = share ?? cap;

  const applySaved = (r: SavedRoute) => {
    setOrigin(r.origin);
    setDestination(r.destination);
    setTime(r.time);
    setViaTouched(false);
    setStep(3); // straight to the cost share: the repeat path
  };

  const publish = () => {
    const departureAt = `2026-09-04T${time}:00+06:00`;
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
      zoneSequence: [origin!, ...effectiveVia, destination!],
      departureAt,
      seatsTotal: seats,
      seatsAvailable: seats,
      costSharePerSeat: chosenShare,
      fuelPriceId: ACTIVE_FUEL_PRICE.id,
      fuelRatePerKm: breakdown.fuelRatePerKm,
      distanceKm,
      pickupPoints: [origin!, ...effectiveVia].map((zid) => ({
        zoneId: zid,
        label: `${zoneName(zid, "en")} main road`,
        walkingMinutes: 4,
      })),
      vehicle: { type: "car", model, colour, plateLast4: plate, ratedKmPerLitre: 12, fuelType: "octane" },
      preferences: prefs,
      status: "published",
      rowVersion: 1,
    };
    app.publish(ride);
    onDone();
  };

  const canNext = [Boolean(origin && destination), Boolean(time), seats >= 1, true][step];

  return (
    <div>
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
              <span className="label">{t("passingThrough", lang)}</span>
              <div className="chips">
                {effectiveVia.length === 0 && <span className="hint">—</span>}
                {effectiveVia.map((zid) => (
                  <button
                    key={zid}
                    type="button"
                    className="chip via small"
                    onClick={() => {
                      setViaTouched(true);
                      setVia(effectiveVia.filter((v) => v !== zid));
                    }}
                    aria-label={`Remove ${zoneName(zid, "en")}`}
                  >
                    {zoneName(zid, lang)} ✕
                  </button>
                ))}
              </div>
              <p className="hint">{t("passingThroughHint", lang)}</p>
            </div>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <div className="card">
            <label className="label" htmlFor="time">{t("when", lang)}</label>
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

      {step === 3 && (
        <>
          <div className="card">
            {/* The working is always shown. A number nobody can explain is a
                number nobody trusts, and this one has to survive scrutiny. */}
            <div className="working">
              {working.calculation}
              <div style={{ marginTop: 6, fontWeight: 600 }}>{working.recovery}</div>
              <div className="prov">{working.provenance}</div>
            </div>

            <div style={{ marginTop: 16 }}>
              <span className="label">
                {taka(chosenShare, lang)} {t("perSeat", lang)}
              </span>
              <input
                type="range"
                min={0}
                max={cap}
                step={10}
                value={chosenShare}
                onChange={(e) => setShare(Number(e.target.value))}
                aria-label={t("costShare", lang)}
                style={{ width: "100%", minHeight: 44 }}
              />
              <p className="hint">{t("youMayLower", lang)}</p>
              <p className="hint"><strong>{t("capNotice", lang)}</strong> {taka(cap, lang)}</p>
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
              <span>{taka(chosenShare, lang)} {t("perSeat", lang)}</span>
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
