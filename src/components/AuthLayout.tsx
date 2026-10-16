import type { ReactNode } from "react";
import { Link } from "react-router";
import { isNativeApp } from "../lib/platform";
import { HeroMock } from "../pages/marketing/Home";
import "../marketing.css";
import UpdateBanner from "./UpdateBanner";

const POINTS = [
  "Bills with parts, labour and discounts",
  "Send bills to customers on WhatsApp",
  "Vehicle history by number plate",
  "Daily and monthly sales reports",
];

/**
 * Sign-in and registration screens. Wide screens (desktop app, PC browser): brand panel
 * on the left, form on the right. Narrow screens (phones): just the form, logo on top.
 */
export default function AuthLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const logo = `${import.meta.env.BASE_URL}pitshop-plus-dark.svg`;
  return (
    <main className="auth">
      <aside className="auth-brand">
        {isNativeApp ? (
          <img src={logo} alt="Pitshop Plus by Skye Automotives" className="auth-brand-logo" />
        ) : (
          <Link to="/" aria-label="Pitshop Plus home">
            <img src={logo} alt="Pitshop Plus by Skye Automotives" className="auth-brand-logo" />
          </Link>
        )}
        <div className="auth-brand-copy">
          <h2>Billing for automobile workshops</h2>
          <ul>
            {POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div className="auth-preview">
          <HeroMock />
        </div>
        <p className="auth-brand-foot">Made by Skye Automotives</p>
      </aside>
      <section className="auth-main">
        <div className={`auth-panel${wide ? " auth-panel-wide" : ""}`}>
          <img src={`${import.meta.env.BASE_URL}pitshop-plus.svg`} alt="Pitshop Plus by Skye Automotives" className="auth-mobile-logo" />
          <UpdateBanner />
          {children}
        </div>
      </section>
    </main>
  );
}
