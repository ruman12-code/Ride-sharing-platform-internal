import { useMemo, useState } from "react";
import { buildWorkbook, exportFilename } from "../../export/excel.js";
import { writeWorkbook } from "../../export/xlsx-writer.js";
import { FUEL_PRICES } from "../../adapters/local-json/seed/fuel.js";
import { ZONES } from "../../adapters/local-json/seed/zones.js";
import { isStale, priceAgeInDays } from "../../domain/pricing/fuel.js";
import { balanceFor, reciprocityLabel } from "../../domain/entities/ledger.js";
import { DEFAULT_DAILY_RIDE_CAP } from "../../domain/policy/invariants.js";
import { type Lang, num, t, taka } from "../i18n.js";
import { COLLEAGUES, ME, type App } from "../store.js";

/**
 * Admin: fuel rate, daily cap, ledger, incidents, metrics, Excel export.
 *
 * The metrics chosen here are the ones that can actually be read at an
 * organisation of under 150 people. Completed trips leads, because the legacy
 * tool could not establish that a single ride ever happened, and one provable
 * trip is a categorical improvement over an unmeasurable zero.
 */
export const Admin = ({ app, lang }: { app: App; lang: Lang }) => {
  const today = "2026-09-04";
  const [inviteName, setInviteName] = useState("");
  const [issued, setIssued] = useState<{ name: string; code: string } | undefined>();
  const [inviting, setInviting] = useState(false);
  const [prices, setPrices] = useState(FUEL_PRICES);
  const [cap, setCap] = useState(DEFAULT_DAILY_RIDE_CAP);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<string | undefined>();

  const octane = prices.find((p) => p.id === "fp-octane-2026-06")!;
  const stale = isStale(octane, today);

  const users = useMemo(() => [ME, ...COLLEAGUES], []);
  const ledger = app.ledger;

  const completed = app.bookings.filter((b) => b.status === "completed").length;
  const avoided = app.bookings.filter(
    (b) => b.counterfactualMode === "own_car" || b.counterfactualMode === "ride_hailing",
  ).length;

  const doExport = async () => {
    setExporting(true);
    try {
      const sheets = buildWorkbook({
        rides: app.rides,
        bookings: app.bookings,
        users,
        zones: ZONES,
        ledger,
        fuelPrices: prices,
        generatedAt: `${today}T10:00:00+06:00`,
      });
      const buffer = await writeWorkbook(sheets);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFilename(`${today}T10:00:00+06:00`);
      a.click();
      URL.revokeObjectURL(url);
      setExported(a.download);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <h2 className="h2">{t("admin", lang)}</h2>

      {/*
        Minting a code is the first thing an administrator does and the thing
        they do most often during a pilot, so it sits at the top rather than
        buried under the metrics.
      */}
      <p className="section-title" style={{ marginTop: 0 }}>{t("inviteColleague", lang)}</p>
      <div className="card raised">
        <label className="label" htmlFor="invite-name">{t("theirName", lang)}</label>
        <input
          id="invite-name"
          className="input"
          value={inviteName}
          onChange={(e) => setInviteName(e.target.value)}
          placeholder={lang === "en" ? "e.g. Nusrat" : "যেমন নুসরাত"}
        />
        <button
          className="btn primary block"
          style={{ marginTop: 12 }}
          disabled={inviteName.trim().length === 0 || inviting}
          onClick={() => {
            setInviting(true);
            void fetch("/api/admin/invite", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ displayName: inviteName.trim() }),
            })
              .then((r) => r.json())
              .then((b: { code?: string }) => {
                if (b.code) setIssued({ name: inviteName.trim(), code: b.code });
                setInviteName("");
              })
              .finally(() => setInviting(false));
          }}
        >
          {inviting ? "…" : t("generateCode", lang)}
        </button>

        {issued && (
          <div className="notice good" style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13 }}>{t("codeIssued", lang)} — {issued.name}</div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: "0.22em",
                margin: "8px 0 6px",
              }}
            >
              {issued.code}
            </div>
            <div style={{ fontSize: 12 }}>{t("codeOnce", lang)}</div>
          </div>
        )}
      </div>

      <p className="section-title">{t("metrics", lang)}</p>
      <div className="card">
        <div className="statgrid">
          <Stat label={t("completedTrips", lang)} value={num(completed, lang)} lang={lang} lead />
          <Stat label={t("ridesPublished", lang)} value={num(app.rides.length, lang)} lang={lang} />
          <Stat label={t("zeroResults", lang)} value={num(app.alerts.length, lang)} lang={lang} />
          <Stat label={t("carTripsAvoided", lang)} value={num(avoided, lang)} lang={lang} />
        </div>
        <p className="hint">
          {num(app.rides.length, lang)} {t("ridesPublished", lang).toLowerCase()} — {t("legacyBaseline", lang)}
        </p>
      </div>

      <p className="section-title">{t("fuelRate", lang)}</p>
      <div className="card">
        {/*
          Staleness and incorrectness are different things. Octane at Tk 145 was
          still the rate in force months after it took effect, so the admin
          re-affirms it rather than inventing a price change that never happened.
        */}
        {stale && <div className="notice warn" style={{ marginBottom: 12 }}>{t("fuelStale", lang)}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 650 }}>{taka(octane.pricePerLitre, lang)} / L — octane</div>
            <div className="hint">
              {octane.effectiveFrom} · {num(priceAgeInDays(octane, today), lang)} days
            </div>
          </div>
          {stale ? (
            <button
              className="btn secondary"
              onClick={() =>
                setPrices((ps) =>
                  ps.map((p) => (p.id === octane.id ? { ...p, confirmedAt: today } : p)),
                )
              }
            >
              {t("confirmRate", lang)}
            </button>
          ) : (
            <span className="badge exact_route">✓ {t("rateConfirmed", lang)}</span>
          )}
        </div>
      </div>

      <p className="section-title">{t("dailyCap", lang)}</p>
      <div className="card">
        <div className="stepper">
          <button onClick={() => setCap(Math.max(1, cap - 1))} aria-label="Decrease cap">−</button>
          <output className="value">{num(cap, lang)}</output>
          <button onClick={() => setCap(Math.min(6, cap + 1))} aria-label="Increase cap">+</button>
        </div>
        <p className="hint">
          {lang === "en"
            ? "A cap on published rides per driver per day. Cannot be removed, only adjusted."
            : "প্রতি চালক প্রতিদিন কতটি রাইড দিতে পারবেন। সরানো যায় না, কেবল বদলানো যায়।"}
        </p>
      </div>

      <p className="section-title">{t("ledger", lang)}</p>
      <div className="card">
        <div className="notice" style={{ marginBottom: 12, background: "var(--green-wash)", borderColor: "#bcd9cc", color: "var(--green-dark)" }}>
          {t("ledgerNotMoney", lang)}
        </div>
        {users.map((u) => {
          const b = balanceFor(ledger, u.id);
          if (b.ridesGiven === 0 && b.ridesTaken === 0) return null;
          return (
            <div key={u.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{u.displayName}</div>
                {/* Reciprocity, never a debt. */}
                <div className="hint">{reciprocityLabel(b)}</div>
              </div>
              <div className="cost">{taka(b.net, lang)}</div>
            </div>
          );
        })}
        {ledger.length === 0 && <p className="hint" style={{ margin: 0 }}>{t("nothingHere", lang)}</p>}
      </div>

      <p className="section-title">{t("incidents", lang)}</p>
      <div className="card">
        {app.incidents.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>{t("noIncidents", lang)}</p>
        ) : (
          app.incidents.map((i) => (
            <div key={i.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <span className={`badge ${i.severity === "high" ? "short_detour" : "muted"}`}>{i.category}</span>
              <div style={{ marginTop: 4 }}>{i.description}</div>
            </div>
          ))
        )}
      </div>

      <p className="section-title">{t("exportExcel", lang)}</p>
      <div className="card">
        <button className="btn primary block" onClick={doExport} disabled={exporting}>
          {exporting ? "…" : t("exportExcel", lang)}
        </button>
        <p className="hint">{t("exportHint", lang)}</p>
        {exported && <div className="notice" style={{ background: "var(--green-wash)", borderColor: "#bcd9cc", color: "var(--green-dark)" }}>✓ {exported}</div>}
      </div>
    </div>
  );
};

const Stat = ({ label, value, lead }: { label: string; value: string; lang: Lang; lead?: boolean }) => (
  <div className={`stat${lead ? " lead" : ""}`}>
    <div className="statvalue">{value}</div>
    <div className="statlabel">{label}</div>
  </div>
);
