import { useState } from "react";
import type { Lang } from "./i18n.js";
import { t } from "./i18n.js";
import { useApp } from "./store.js";
import { Home } from "./screens/Home.jsx";
import { OfferFlow } from "./screens/OfferFlow.jsx";
import { FindFlow } from "./screens/FindFlow.jsx";
import { MyRides } from "./screens/MyRides.jsx";
import { Admin } from "./screens/Admin.jsx";

type Screen = "home" | "offer" | "find" | "mine" | "admin";

export const App = () => {
  const app = useApp();
  const [lang, setLang] = useState<Lang>("en");
  const [screen, setScreen] = useState<Screen>("home");

  return (
    <div className="app" lang={lang}>
      <header className="topbar">
        <h1 className="wordmark">
          {t("appName", lang)}
          <span className="sub">{t("appNameSub", lang)}</span>
        </h1>
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
