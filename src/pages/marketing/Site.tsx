import { useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import "../../marketing.css";

export { DOWNLOADS } from "../../lib/downloads";
export const CONTACT_EMAIL = "skyeautomotives@gmail.com";

/** Header and footer shared by the public pages (home, download). */
export default function Site({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mk">
      <header className="mk-nav">
        <div className="mk-wrap mk-nav-inner">
          <Link to="/" className="mk-brand" aria-label="Pitstop Plus home">
            <img src={`${import.meta.env.BASE_URL}pitstop-plus.svg`} alt="Pitstop Plus by Skye Automotives" />
          </Link>
          <button type="button" className="mk-menu" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>
            <span />
            <span />
            <span />
          </button>
          <nav className={`mk-links${open ? " open" : ""}`} onClick={() => setOpen(false)}>
            <a href={`${import.meta.env.BASE_URL}#features`}>Features</a>
            <a href={`${import.meta.env.BASE_URL}#how`}>How it works</a>
            <NavLink to="/download">Download</NavLink>
            <a href={`${import.meta.env.BASE_URL}#faq`}>FAQ</a>
            <Link to="/login" className="mk-signin">
              Sign in
            </Link>
            <Link to="/register" className="mk-btn mk-btn-primary mk-btn-sm">
              Register free
            </Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="mk-footer">
        <div className="mk-wrap mk-footer-inner">
          <div>
            <img src={`${import.meta.env.BASE_URL}pitstop-plus.svg`} alt="Pitstop Plus" className="mk-footer-logo" />
            <p>Billing and service management for automobile workshops.</p>
          </div>
          <div className="mk-footer-cols">
            <div>
              <h4>Product</h4>
              <a href={`${import.meta.env.BASE_URL}#features`}>Features</a>
              <Link to="/download">Download</Link>
              <Link to="/register">Register</Link>
              <Link to="/login">Sign in</Link>
            </div>
            <div>
              <h4>Company</h4>
              <span>Skye Automotives</span>
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              <Link to="/terms">Terms &amp; Conditions</Link>
              <Link to="/privacy">Privacy Policy</Link>
            </div>
          </div>
        </div>
        <div className="mk-wrap mk-copy">© {new Date().getFullYear()} Skye Automotives. All rights reserved.</div>
      </footer>
    </div>
  );
}
