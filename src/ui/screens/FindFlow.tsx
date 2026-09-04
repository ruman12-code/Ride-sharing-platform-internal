import { useMemo, useState } from "react";
import type { CounterfactualMode, SettlementMode } from "../../domain/entities/booking.js";
import type { MatchResult } from "../../domain/matching/corridor.js";
import { type Lang, num, t, taka } from "../i18n.js";
import { Sheet, Stepper, ZonePicker, initials, timeOf, zoneName } from "../components/common.jsx";
import { userById, type App } from "../store.js";

/**
 * The rider's flow: one search bar, result cards, a booking sheet.
 *
 * Two things here are load-bearing rather than decorative:
 *
 *   1. Every result carries its match label. A "short detour" result that looks
 *      like an exact match reads as a bug, and the rider stops trusting the list.
 *   2. The empty state is a feature. At this headcount most searches will find
 *      nothing at first, and a dead end is where a colleague decides the tool
 *      does not work and never returns. It offers "alert me" and the chance to
 *      drive instead, and it says how many others want the same route.
 */

const COUNTERFACTUALS: readonly {
  readonly mode: CounterfactualMode;
  readonly key: "cf_bus" | "cf_rickshaw_cng" | "cf_own_car" | "cf_ride_hailing" | "cf_would_not_travel";
}[] = [
  { mode: "bus", key: "cf_bus" },
  { mode: "rickshaw_cng", key: "cf_rickshaw_cng" },
  { mode: "own_car", key: "cf_own_car" },
  { mode: "ride_hailing", key: "cf_ride_hailing" },
  { mode: "would_not_travel", key: "cf_would_not_travel" },
];

const SETTLEMENTS: readonly {
  readonly mode: SettlementMode;
  readonly key: "sm_credit_ledger" | "sm_employer" | "sm_cash";
}[] = [
  { mode: "credit_ledger", key: "sm_credit_ledger" },
  { mode: "employer", key: "sm_employer" },
  { mode: "cash", key: "sm_cash" },
];

export const FindFlow = ({
  app, lang, onOfferInstead,
}: {
  app: App;
  lang: Lang;
  onOfferInstead: () => void;
}) => {
  // Pre-filled from the saved commute, so the common case is one tap.
  const [origin, setOrigin] = useState<string | undefined>("uttara");
  const [destination, setDestination] = useState<string | undefined>("gulshan-2");
  const [time, setTime] = useState("07:45");
  const [seats, setSeats] = useState(1);
  const [searched, setSearched] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<MatchResult | undefined>();
  const [alerted, setAlerted] = useState(false);

  const results = useMemo(() => {
    if (!searched || !origin || !destination) return [];
    return app.search({
      originZoneId: origin,
      destinationZoneId: destination,
      targetTime: `${app.today}T${time}:00+06:00`,
      windowMinutes: 30,
      seats,
    });
  }, [app, searched, origin, destination, time, seats]);

  const runSearch = () => {
    setSearched(true);
    setEditing(false);
    setAlerted(false);
  };

  return (
    <div>
      <h2 className="h2">{t("findARide", lang)}</h2>

      <div className="card">
        <button
          type="button"
          className="toggle"
          onClick={() => setEditing((e) => !e)}
          aria-expanded={editing}
        >
          <span>
            <strong>
              {origin ? zoneName(origin, lang) : "—"} → {destination ? zoneName(destination, lang) : "—"}
            </strong>
            <span className="d" style={{ display: "block", fontSize: 13, color: "var(--ink-soft)" }}>
              {num(time, lang)} · {num(seats, lang)}{" "}
              {t(seats === 1 ? "seatNeeded" : "seatsNeeded", lang)}
            </span>
          </span>
          <span aria-hidden="true">{editing ? "▴" : "▾"}</span>
        </button>

        {editing && (
          <div style={{ marginTop: 14 }}>
            <ZonePicker value={origin} onChange={setOrigin} lang={lang} exclude={destination} label={t("from", lang)} />
            <div style={{ height: 14 }} />
            <ZonePicker value={destination} onChange={setDestination} lang={lang} exclude={origin} label={t("to", lang)} />
            <div style={{ height: 14 }} />
            <label className="label" htmlFor="find-time">{t("searchWhen", lang)}</label>
            <input id="find-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            <div style={{ height: 14 }} />
            <span className="label">{t("seatsNeeded", lang)}</span>
            <Stepper value={seats} min={1} max={4} onChange={setSeats} ariaLabel={t("seatsNeeded", lang)} />
          </div>
        )}

        <button className="btn primary block" style={{ marginTop: 14 }} onClick={runSearch}>
          {t("searchAction", lang)}
        </button>
      </div>

      {searched && results.length > 0 && (
        <>
          <p className="section-title">
            {num(results.length, lang)} {t("resultsCount", lang)}
          </p>
          <div className="card flush">
            {results.map((m) => {
              const driver = userById(m.ride.driverId);
              return (
                <div className="result" key={m.ride.id}>
                  <div className="avatar" aria-hidden="true">{initials(driver?.displayName ?? "?")}</div>
                  <div className="body">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <div className="name">{driver?.displayName}</div>
                        <div className="dept">{driver?.department}</div>
                      </div>
                      <div style={{ textAlign: "end" }}>
                        <div className="when">{timeOf(m.ride.departureAt, lang)}</div>
                        <div className="cost">{taka(m.ride.costSharePerSeat, lang)}</div>
                      </div>
                    </div>

                    <div className="meta">
                      <span className={`badge ${m.label}`}>{t(m.label, lang)}</span>
                      <span>{num(m.walkingMinutes, lang)} {t("minWalk", lang)}</span>
                      <span>
                        {num(m.ride.seatsAvailable, lang)}{" "}
                        {t(m.ride.seatsAvailable === 1 ? "seatLeft" : "seatsLeft", lang)}
                      </span>
                      {m.ride.preferences.womenOnly && <span className="badge muted">{t("womenOnly", lang)}</span>}
                      {m.ride.preferences.ac && <span className="badge muted">{t("ac", lang)}</span>}
                    </div>

                    <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => setSelected(m)}>
                      {t("requestSeat", lang)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {searched && results.length === 0 && (
        <div className="card">
          <div className="empty">
            <div className="mark" aria-hidden="true">🔍</div>
            <h3>
              {t("noMatchTitle", lang)} — {origin ? zoneName(origin, lang) : ""} →{" "}
              {destination ? zoneName(destination, lang) : ""} {num(time, lang)}
            </h3>
            <p>
              {alerted ? t("noMatchBody", lang) : `${num(3, lang)} ${t("alsoWant", lang)}`}
            </p>
            <button
              className="btn secondary block"
              disabled={alerted}
              onClick={() => {
                // Every zero-result search is logged with its parameters, and
                // becomes a standing demand record. At this headcount that log
                // is a better demand signal than the posting count.
                if (origin && destination) {
                  app.addAlert({
                    originZoneId: origin,
                    destinationZoneId: destination,
                    targetTime: `${app.today}T${time}:00+06:00`,
                    windowMinutes: 30,
                    seats,
                  });
                }
                setAlerted(true);
              }}
            >
              {alerted ? "✓ " : ""}{t("alertMe", lang)}
            </button>
            <div style={{ height: 10 }} />
            <p style={{ margin: 0 }}>{t("driveItYourself", lang)}</p>
            <button className="btn ghost block" onClick={onOfferInstead}>{t("offerASeat", lang)}</button>
          </div>
        </div>
      )}

      {selected && (
        <BookingSheet
          app={app}
          lang={lang}
          match={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
    </div>
  );
};

const BookingSheet = ({
  app, lang, match, onClose,
}: {
  app: App;
  lang: Lang;
  match: MatchResult;
  onClose: () => void;
}) => {
  // The rider chooses which stop on the driver's route to join at. The match
  // told them the route passes near them; this is where they say which point
  // they will actually walk to.
  const [boardZoneId, setBoardZoneId] = useState<string>(match.boardZoneId);
  const [alightZoneId, setAlightZoneId] = useState<string>(match.alightZoneId);
  const [counterfactual, setCounterfactual] = useState<CounterfactualMode | undefined>();
  const [settlement, setSettlement] = useState<SettlementMode>("credit_ledger");
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  // Stable for the life of the sheet, so a double-tap is one booking.
  const [idempotencyKey] = useState(() => `${match.ride.id}:${Date.now()}`);

  const seq = match.ride.zoneSequence;
  const boardIndex = seq.indexOf(boardZoneId);
  // A rider can only get out after they have got in, so the options for each end
  // are constrained by the other. Offering an impossible pair and then rejecting
  // it in the domain would be a worse experience than not offering it.
  const boardOptions = seq.slice(0, Math.max(1, seq.indexOf(alightZoneId)));
  const alightOptions = seq.slice(boardIndex + 1);
  const pickup = match.ride.pickupPoints.find((p) => p.zoneId === boardZoneId);
  const driver = userById(match.ride.driverId);
  const walkTo = (zid: string) =>
    match.ride.pickupPoints.find((p) => p.zoneId === zid)?.walkingMinutes ?? 10;

  const confirm = () => {
    if (!counterfactual) return;
    const r = app.book({
      rideId: match.ride.id,
      boardZoneId,
      alightZoneId,
      seats: 1,
      counterfactualMode: counterfactual,
      settlementMode: settlement,
      idempotencyKey,
    });
    if (r.ok) setDone(true);
    else setError(r.error.message);
  };

  return (
    <Sheet onClose={onClose} titleId="booking-title">
      <h2 className="h2" id="booking-title">
        {driver?.displayName} · {timeOf(match.ride.departureAt, lang)}
      </h2>

      {done ? (
        <>
          <div className="notice" style={{ background: "var(--green-wash)", borderColor: "#bcd9cc", color: "var(--green-dark)" }}>
            ✓ {t("requestSeat", lang)} — {driver?.displayName}
          </div>
          <p className="hint">
            {lang === "en"
              ? "We've asked them. You'll get a notification either way."
              : "আমরা জানিয়ে দিয়েছি। যেকোনো উত্তরেই নোটিফিকেশন পাবেন।"}
          </p>
          <button className="btn primary block" onClick={onClose}>{t("home", lang)}</button>
        </>
      ) : (
        <>
          {/*
            Every stop on the driver's route is a legitimate joining point, so
            the rider picks the one nearest them rather than being assigned the
            one they happened to search from. Walking minutes are shown against
            each, because that is the number that actually decides it.
          */}
          <div className="card" style={{ boxShadow: "none" }}>
            <span className="label">{t("whereWillYouJoin", lang)}</span>
            <div className="chips" role="group" aria-label={t("whereWillYouJoin", lang)}>
              {boardOptions.map((zid) => (
                <button
                  key={zid}
                  type="button"
                  className="chip small"
                  aria-pressed={boardZoneId === zid}
                  onClick={() => setBoardZoneId(zid)}
                >
                  {zoneName(zid, lang)} · {num(walkTo(zid), lang)}{t("minutes", lang)}
                </button>
              ))}
            </div>
            <div className="hint">{pickup?.label}</div>

            <span className="label" style={{ marginTop: 14 }}>{t("whereWillYouLeave", lang)}</span>
            <div className="chips" role="group" aria-label={t("whereWillYouLeave", lang)}>
              {alightOptions.map((zid) => (
                <button
                  key={zid}
                  type="button"
                  className="chip small"
                  aria-pressed={alightZoneId === zid}
                  onClick={() => setAlightZoneId(zid)}
                >
                  {zoneName(zid, lang)}
                </button>
              ))}
            </div>
          </div>

          {/*
            Required, and never dropped to save a tap. Without it we cannot
            answer "you are just pulling people off buses", and the answer is
            unrecoverable after the trip.
          */}
          <div className="card" style={{ boxShadow: "none" }}>
            <span className="label">{t("counterfactualQuestion", lang)}</span>
            <div className="chips">
              {COUNTERFACTUALS.map((c) => (
                <button
                  key={c.mode}
                  type="button"
                  className="chip small"
                  aria-pressed={counterfactual === c.mode}
                  onClick={() => setCounterfactual(c.mode)}
                >
                  {t(c.key, lang)}
                </button>
              ))}
            </div>
            <p className="hint">{t("counterfactualWhy", lang)}</p>
          </div>

          <div className="card" style={{ boxShadow: "none" }}>
            <span className="label">{t("settlement", lang)}</span>
            <div className="chips">
              {SETTLEMENTS.map((s) => (
                <button
                  key={s.mode}
                  type="button"
                  className="chip small"
                  aria-pressed={settlement === s.mode}
                  onClick={() => setSettlement(s.mode)}
                >
                  {t(s.key, lang)}
                </button>
              ))}
            </div>
            <div className="working" style={{ marginTop: 12 }}>
              {taka(match.ride.costSharePerSeat, lang)} {t("perSeat", lang)}
              <div className="prov">{t("tagline", lang)}</div>
            </div>
          </div>

          {error && <div className="notice error">{error}</div>}

          <div className="btnrow">
            <button className="btn ghost" onClick={onClose}>{t("cancel", lang)}</button>
            <button className="btn primary" disabled={!counterfactual} onClick={confirm}>
              {t("confirm", lang)}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
};
