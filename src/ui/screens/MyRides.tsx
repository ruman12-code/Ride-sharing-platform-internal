import { useState } from "react";
import { type Lang, num, t, taka } from "../i18n.js";
import { timeOf, zoneName } from "../components/common.jsx";
import { userById, type App } from "../store.js";

type Tab = "upcoming" | "past" | "offering";

export const MyRides = ({ app, lang }: { app: App; lang: Lang }) => {
  const [tab, setTab] = useState<Tab>("upcoming");

  const rows =
    tab === "offering"
      ? app.myRides.map((r) => ({
          key: r.id,
          title: `${zoneName(r.zoneSequence[0]!, lang)} → ${zoneName(r.zoneSequence.at(-1)!, lang)}`,
          who: `${num(r.seatsAvailable, lang)} ${t(r.seatsAvailable === 1 ? "seatLeft" : "seatsLeft", lang)}`,
          when: timeOf(r.departureAt, lang),
          amount: r.costSharePerSeat,
        }))
      : app.myBookings.map((b) => {
          const ride = app.rides.find((r) => r.id === b.rideId);
          return {
            key: b.id,
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
