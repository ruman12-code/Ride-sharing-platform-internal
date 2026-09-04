import { useState } from "react";
import type { IncidentCategory } from "../../domain/entities/support.js";
import { type Lang, num, t, taka } from "../i18n.js";
import { Sheet, timeOf, zoneName } from "../components/common.jsx";
import { userById, type App } from "../store.js";

type Tab = "upcoming" | "past" | "offering";

/**
 * The counterpart's contact details, on request.
 *
 * Fetched when asked for rather than delivered with the booking: the release is
 * an event that gets recorded, so it happens when somebody actually needs the
 * number, not every time the screen renders.
 */
const ContactRow = ({
  app, lang, bookingId,
}: {
  app: App;
  lang: Lang;
  bookingId: string;
}) => {
  const [shown, setShown] = useState<{ name: string; value: string } | undefined>();
  // Only after the answer comes back. Showing "they have no number" while the
  // request is still in flight tells people something untrue for a moment,
  // which on this particular screen is enough to make them stop asking.
  const [noneOnFile, setNoneOnFile] = useState(false);

  if (shown) {
    return (
      <div className="notice good" style={{ marginTop: 10 }}>
        <div style={{ fontSize: 13 }}>{shown.name}</div>
        <a className="contact-value" href={`tel:${shown.value.replace(/\s+/g, "")}`}>
          {shown.value}
        </a>
      </div>
    );
  }

  return (
    <>
      <button
        className="btn secondary block"
        style={{ marginTop: 10 }}
        onClick={() => {
          void app.revealContact(bookingId).then((c) => {
            if (c) setShown({ name: c.name, value: c.value });
            else setNoneOnFile(true);
          });
        }}
      >
        {t("getTheirNumber", lang)}
      </button>
      {/*
        Said plainly rather than shown as an error. A colleague who has not
        added a number is not a failure, and inventing one would be worse.
      */}
      {noneOnFile && <p className="hint" style={{ marginTop: 6 }}>{t("theirNumberHidden", lang)}</p>}
    </>
  );
};

export const MyRides = ({ app, lang }: { app: App; lang: Lang }) => {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [rating, setRating] = useState<string | undefined>();

  const rows =
    tab === "offering"
      ? app.myRides.map((r) => ({
          key: r.id,
          bookingId: undefined as string | undefined,
          status: r.status as string,
          title: `${zoneName(r.zoneSequence[0]!, lang)} → ${zoneName(r.zoneSequence.at(-1)!, lang)}`,
          who: `${num(r.seatsAvailable, lang)} ${t(r.seatsAvailable === 1 ? "seatLeft" : "seatsLeft", lang)}`,
          when: timeOf(r.departureAt, lang),
          amount: r.costSharePerSeat,
        }))
      : app.myBookings.map((b) => {
          const ride = app.rides.find((r) => r.id === b.rideId);
          return {
            key: b.id,
            bookingId: b.id,
            status: b.status,
            title: `${zoneName(b.boardZoneId, lang)} → ${zoneName(b.alightZoneId, lang)}`,
            who: userById(ride?.driverId ?? "")?.displayName ?? "",
            when: ride ? timeOf(ride.departureAt, lang) : "",
            amount: b.amount,
          };
        });

  return (
    <div>
      <h2 className="h2">{t("myRides", lang)}</h2>

      <div className="chips" style={{ marginBottom: 14 }} role="tablist">
        {(["upcoming", "past", "offering"] as const).map((x) => (
          <button
            key={x}
            role="tab"
            className="chip small"
            aria-selected={tab === x}
            aria-pressed={tab === x}
            onClick={() => setTab(x)}
          >
            {t(x, lang)}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card"><p className="hint" style={{ margin: 0 }}>{t("nothingHere", lang)}</p></div>
      ) : (
        <div className="card flush">
          {rows.map((r) => (
            <div className="result" key={r.key}>
              <div className="body">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div className="name">{r.title}</div>
                    <div className="dept">{r.who}</div>
                  </div>
                  <div style={{ textAlign: "end" }}>
                    <div className="when">{r.when}</div>
                    <div className="cost">{taka(r.amount, lang)}</div>
                  </div>
                </div>

                {/*
                  A confirmed seat is the moment the two of them need to speak,
                  so the number is offered here and only here. It said
                  "Completed trips" before — a metrics label on a button, which
                  told a rider nothing about what tapping it would do.
                */}
                {r.bookingId && r.status === "confirmed" && (
                  <ContactRow app={app} lang={lang} bookingId={r.bookingId} />
                )}

                {r.bookingId && r.status !== "completed" && (
                  <button
                    className="btn secondary block"
                    style={{ marginTop: 10 }}
                    onClick={() => app.completeTrip(r.bookingId!)}
                  >
                    ✓ {t("markDone", lang)}
                  </button>
                )}

                {r.bookingId && r.status === "completed" && !app.feedback.some((f) => f.bookingId === r.bookingId) && (
                  <button
                    className="btn secondary block"
                    style={{ marginTop: 10 }}
                    onClick={() => setRating(r.bookingId)}
                  >
                    ★ {t("rateTrip", lang)}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {rating && (
        <RatingSheet
          app={app}
          lang={lang}
          bookingId={rating}
          onClose={() => setRating(undefined)}
        />
      )}
    </div>
  );
};

const CATEGORIES: readonly IncidentCategory[] = [
  "no_show", "unsafe_driving", "safety", "harassment", "other",
];

/**
 * Rating and problem reporting.
 *
 * Ratings are aggregate-only: a colleague sees an average, never who gave what.
 * In an office of this size an attributed rating is a lasting social cost, and
 * the fear of it would stop people rating honestly — or at all.
 */
const RatingSheet = ({
  app, lang, bookingId, onClose,
}: {
  app: App;
  lang: Lang;
  bookingId: string;
  onClose: () => void;
}) => {
  const [stars, setStars] = useState<1 | 2 | 3 | 4 | 5 | undefined>();
  const [reporting, setReporting] = useState(false);
  const [category, setCategory] = useState<IncidentCategory | undefined>();
  const [detail, setDetail] = useState("");
  const [done, setDone] = useState(false);

  const booking = app.bookings.find((b) => b.id === bookingId);
  const ride = booking ? app.rides.find((r) => r.id === booking.rideId) : undefined;

  const submit = () => {
    if (stars && ride) app.rate(bookingId, ride.driverId, stars);
    if (reporting && category) app.reportIncident(bookingId, category, detail);
    setDone(true);
  };

  return (
    <Sheet onClose={onClose} titleId="rate-title">
      <h2 className="h2" id="rate-title">{t("rateTrip", lang)}</h2>
      {done ? (
        <>
          <div className="notice" style={{ background: "var(--green-wash)", borderColor: "#bcd9cc", color: "var(--green-dark)" }}>
            ✓ {t("thanks", lang)}
          </div>
          <button className="btn primary block" onClick={onClose}>{t("home", lang)}</button>
        </>
      ) : (
        <>
          <div className="chips" role="group" aria-label={t("rateTrip", lang)}>
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button
                key={n}
                type="button"
                className="chip"
                aria-pressed={stars === n}
                onClick={() => setStars(n)}
              >
                {"★".repeat(n)}
              </button>
            ))}
          </div>
          <p className="hint">{t("ratingAnonymous", lang)}</p>

          <button
            type="button"
            className="toggle"
            aria-pressed={reporting}
            onClick={() => setReporting((v) => !v)}
          >
            <span>{t("reportIssue", lang)}</span>
            <span className="switch" aria-hidden="true" />
          </button>

          {reporting && (
            <div style={{ marginTop: 10 }}>
              <div className="chips">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="chip small"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                  >
                    {c.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
              <textarea
                className="input"
                style={{ marginTop: 10, minHeight: 88 }}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                aria-label={t("reportIssue", lang)}
              />
            </div>
          )}

          <div className="btnrow">
            <button className="btn ghost" onClick={onClose}>{t("cancel", lang)}</button>
            <button
              className="btn primary"
              disabled={!stars && !(reporting && category)}
              onClick={submit}
            >
              {t("submit", lang)}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
};
