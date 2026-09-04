import { useEffect, useState } from "react";
import type { Lang } from "./i18n.js";
import { t } from "./i18n.js";
import { useApp } from "./store.js";
import { Home } from "./screens/Home.jsx";
import { OfferFlow } from "./screens/OfferFlow.jsx";
import { FindFlow } from "./screens/FindFlow.jsx";
import { MyRides } from "./screens/MyRides.jsx";
import { Admin } from "./screens/Admin.jsx";
import { AccessGate } from "./screens/AccessGate.jsx";
import { Wordmark } from "./components/Wordmark.jsx";

type Screen = "home" | "offer" | "find" | "mine" | "admin";

export const App = () => {
  const app = useApp();
  const [lang, setLang] = useState<Lang>("en");
  const [screen, setScreen] = useState<Screen>("home");

  /**
   * Whether a signed-in session exists.
   *
   * `undefined` while we are still asking. Rendering the app and then yanking
   * it away would show a colleague their neighbours' journeys for a moment,
   * which is exactly the disclosure the gate exists to prevent.
   *
   * When the app is served without the pilot server behind it — the standalone
   * demo build — /api/me is absent, and it opens straight into the demo data.
   */
  const [session, setSession] = useState<"in" | "out" | "no-server" | undefined>();

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me")
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setSession("in");
        else if (r.status === 401) setSession("out");
        else setSession("no-server");
      })
      .catch(() => {
        if (!cancelled) setSession("no-server");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (session === undefined) {
    return (
      <div className="app" lang={lang}>
        <div className="main">
          <div className="skel" style={{ height: 120, marginTop: 40 }} aria-label="Loading" />
        </div>
      </div>
    );
  }

  if (session === "out") {
    return (
      <div className="app" lang={lang}>
        <header className="topbar">
          <h1 className="wordmark"><Wordmark lang={lang} /></h1>
          <span className="spacer" />
          <div className="langtoggle" role="group" aria-label="Language">
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button aria-pressed={lang === "bn"} onClick={() => setLang("bn")}>বাংলা</button>
          </div>
        </header>
        <AccessGate
          lang={lang}
          onSignedIn={() => {
            setSession("in");
            // The store was created before the gate was passed, so its first
            // load saw a 401. Re-run it now that there is a session.
            void app.reload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="app" lang={lang}>
      <header className="topbar">
        <h1 className="wordmark"><Wordmark lang={lang} /></h1>
        <span className="spacer" />
        <div className="langtoggle" role="group" aria-label="Language">
          <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          <button aria-pressed={lang === "bn"} onClick={() => setLang("bn")}>বাংলা</button>
        </div>
      </header>

      <main className="main">
        {screen === "home" && (
          <Home app={app} lang={lang} onOffer={() => setScreen("offer")} onFind={() => setScreen("find")} />
        )}
        {screen === "offer" && (
          <OfferFlow app={app} lang={lang} onDone={() => setScreen("mine")} onCancel={() => setScreen("home")} />
        )}
        {screen === "find" && (
          <FindFlow app={app} lang={lang} onOfferInstead={() => setScreen("offer")} />
        )}
        {screen === "mine" && <MyRides app={app} lang={lang} />}
        {screen === "admin" && <Admin app={app} lang={lang} />}
        <p className="credit">
          <strong>{t("builtBy", lang)}</strong>
        </p>
      </main>

      <nav className="tabbar" aria-label="Main">
        {([
          ["home", "home", "⌂"],
          ["offer", "offerARide", "🚗"],
          ["find", "findARide", "🔎"],
          ["mine", "myRides", "☰"],
          ["admin", "admin", "⚙"],
        ] as const).map(([id, key, glyph]) => (
          <button
            key={id}
            aria-current={screen === id ? "page" : undefined}
            onClick={() => setScreen(id)}
          >
            <span className="g" aria-hidden="true">{glyph}</span>
            <span>{t(key, lang)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};
