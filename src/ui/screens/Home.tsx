import { type Lang, num, t, taka } from "../i18n.js";
import { Strapline } from "../components/Strapline.jsx";
import { timeOf, zoneName } from "../components/common.jsx";
import { userById, type App } from "../store.js";

/**
 * Two large cards, then today, then what needs the colleague's attention.
 *
 * The live-activity line matters more than it looks: an empty-looking
 * marketplace is abandoned on the first visit, and at under 150 staff most
 * first visits will land on a thin list. Visible liquidity is what converts.
 */
export const Home = ({
  app, lang, onOffer, onFind,
}: {
  app: App;
  lang: Lang;
  onOffer: () => void;
  onFind: () => void;
}) => {
  const nextBooking = app.myBookings.find((b) => b.status === "requested" || b.status === "confirmed");
  const nextRide = nextBooking ? app.rides.find((r) => r.id === nextBooking.rideId) : undefined;

  return (
    <div>
      <button className="bigcard" onClick={onOffer}>
        <span className="icon" aria-hidden="true">🚗</span>
        <span>
          <span className="t">{t("offerARide", lang)}</span>
          <span className="d">{t("offerASeatSub", lang)}</span>
        </span>
      </button>

      <button className="bigcard" onClick={onFind}>
        <span className="icon" aria-hidden="true">🔎</span>
        <span>
          <span className="t">{t("findARide", lang)}</span>
          <span className="d">{t("findARideSub", lang)}</span>
        </span>
      </button>

      <p className="section-title">{t("today", lang)}</p>
      <div className="card">
        {nextRide && nextBooking ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 650 }}>
                  {zoneName(nextBooking.boardZoneId, lang)} → {zoneName(nextBooking.alightZoneId, lang)}
                </div>
                <div className="dept">{userById(nextRide.driverId)?.displayName}</div>
              </div>
              <div style={{ textAlign: "end" }}>
                <div className="when">{timeOf(nextRide.departureAt, lang)}</div>
                <div className="cost">{taka(nextBooking.amount, lang)}</div>
              </div>
            </div>
            <div className="meta">
              <span className={`badge ${nextBooking.status === "confirmed" ? "exact_route" : "short_detour"}`}>
                {nextBooking.status === "confirmed"
                  ? lang === "en" ? "Confirmed" : "নিশ্চিত"
                  : lang === "en" ? "Waiting for driver" : "চালকের উত্তরের অপেক্ষায়"}
              </span>
            </div>
          </>
        ) : (
          <p className="hint" style={{ margin: 0 }}>{t("nothingToday", lang)}</p>
        )}
      </div>

      <div className="card" style={{ background: "var(--green-wash)", borderColor: "#bcd9cc" }}>
        <div style={{ color: "var(--green-dark)", fontSize: 14 }}>
          <strong>{num(app.corridorActivity, lang)}</strong> {t("liveActivity", lang)}
        </div>
      </div>

      <p className="section-title">{t("about", lang)}</p>
      <div className="card">
        <Strapline lang={lang} />
        <p className="hint" style={{ marginTop: 14 }}>{t("aboutBody", lang)}</p>
        <p className="hint" style={{ marginTop: 10, fontWeight: 600 }}>{t("tagline", lang)}</p>
      </div>
    </div>
  );
};
