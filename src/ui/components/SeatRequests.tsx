import { useCallback, useEffect, useState } from "react";
import { type Lang, num, t, taka } from "../i18n.js";
import { zoneName } from "./common.jsx";

interface PendingRequest {
  readonly id: string;
  readonly riderName: string;
  readonly boardZoneId: string;
  readonly alightZoneId: string;
  readonly departureAt: string;
  readonly amount: number;
}

/**
 * Seat requests waiting on this driver.
 *
 * Answering is the one thing a driver must not miss, so it sits at the top of
 * Home rather than behind a tab. The notification tells them; this is where
 * they act.
 */
export const SeatRequests = ({ lang, onAnswered }: { lang: Lang; onAnswered: () => void }) => {
  const [requests, setRequests] = useState<readonly PendingRequest[]>([]);
  const [busy, setBusy] = useState<string | undefined>();

  const load = useCallback(() => {
    void fetch("/api/pending-requests")
      .then((r) => (r.ok ? r.json() : { requests: [] }))
      .then((b: { requests?: PendingRequest[] }) => setRequests(b.requests ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  const answer = (id: string, action: "accept" | "decline") => {
    setBusy(id);
    void fetch(`/api/bookings/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingId: id }),
    })
      .then(() => {
        load();
        onAnswered();
      })
      .finally(() => setBusy(undefined));
  };

  if (requests.length === 0) return null;

  return (
    <>
      <p className="section-title">{t("seatRequests", lang)}</p>
      <div className="card flush">
        {requests.map((r) => (
          <div className="result" key={r.id}>
            <div className="body">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div className="name">{r.riderName} {t("wantsASeat", lang)}</div>
                  <div className="dept">
                    {zoneName(r.boardZoneId, lang)} → {zoneName(r.alightZoneId, lang)}
                  </div>
                </div>
                <div style={{ textAlign: "end" }}>
                  <div className="when">{num(r.departureAt.slice(11, 16), lang)}</div>
                  <div className="cost">{taka(r.amount, lang)}</div>
                </div>
              </div>
              <div className="btnrow" style={{ marginTop: 12 }}>
                <button
                  className="btn ghost"
                  disabled={busy === r.id}
                  onClick={() => answer(r.id, "decline")}
                >
                  {t("decline", lang)}
                </button>
                <button
                  className="btn primary"
                  disabled={busy === r.id}
                  onClick={() => answer(r.id, "accept")}
                >
                  {t("accept", lang)}
                </button>
              </div>
              <p className="hint">{t("declineQuiet", lang)}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};
