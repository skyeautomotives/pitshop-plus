import { Link, Navigate } from "react-router";
import { useAuth } from "../../lib/auth";
import { isNativeApp } from "../../lib/platform";
import Site, { DOWNLOADS } from "./Site";
import { usePageTitle } from "../../lib/usePageTitle";

/** Simple line icons (24 x 24, stroke = currentColor). */
const ICONS: Record<string, string> = {
  bill: "M7 3h10a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1zM9 8h6M9 12h6M9 16h3",
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z",
  car: "M5 16h14M6 16l1.5-5h9L18 16M5 16v3h2v-2h10v2h2v-3M8 13.5h.01M16 13.5h.01",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  whatsapp: "M4 20l1.3-4A8 8 0 1 1 8 18.7zM9 9c0 3 2 6 6 6l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z",
  printer: "M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z",
  chart: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
  team: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M21 20a6 6 0 0 0-4-5.6",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  devices: "M3 5h13v9H3zM7 18h5M9.5 14v4M17 9h4v11h-4z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
};
function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const FEATURES = [
  { icon: "bill", title: "Bills", text: "Add parts with quantity and price, labour, painting and washing. Give a discount as an amount or a percentage. The total is worked out for you." },
  { icon: "wrench", title: "Complaints", text: "Note what the customer reported, the date and who attended them. When a bill covers a complaint, the complaint is marked resolved." },
  { icon: "car", title: "Vehicle history", text: "See every complaint and bill for a vehicle in date order. Enter a number plate you have seen before and the customer's details fill in." },
  { icon: "search", title: "Search", text: "Search by customer name, phone number or vehicle number. The results show matching bills, complaints and vehicles." },
  { icon: "whatsapp", title: "WhatsApp bills", text: "Opens WhatsApp with the customer's number and the bill details filled in. You only press Send. No WhatsApp Business account needed." },
  { icon: "printer", title: "Print and PDF", text: "Print the bill or save it as a PDF, with your workshop's name, address and phone at the top." },
  { icon: "chart", title: "Sales reports", text: "Daily and monthly sales totals, a chart to compare periods, and the work done by each staff member." },
  { icon: "team", title: "Staff logins", text: "Create a login for each staff member. Owners change settings and manage logins. Staff make and send bills." },
  { icon: "shield", title: "Private data", text: "Each workshop sees only its own customers, bills and reports. The database enforces this, not just the app." },
  { icon: "devices", title: "Browser, Windows, Android", text: "Sign in with the same account on any device and see the same bills." },
  { icon: "clock", title: "Works offline", text: "No internet? Keep billing. The apps save bills on the device and sync them when the connection is back, with no duplicates." },
  { icon: "lock", title: "Your own numbering", text: "Bill and complaint numbers start at 1 for your workshop. Set your shop details and billing rules once in Settings." },
];

const STEPS = [
  { title: "Register", text: "Enter your workshop name, your name, mobile number and email." },
  { title: "Confirm your email", text: "Open the email we send you and tap Confirm my email." },
  { title: "Add shop details", text: "Add your address and phone in Settings. They print on every bill." },
  { title: "Make your first bill", text: "Add the parts and labour, then print it or send it on WhatsApp." },
];

const FAQ = [
  { q: "Who is Pitstop Plus for?", a: "Two-wheeler and four-wheeler workshops, service centres and garages that want proper bills and a record of every vehicle they have worked on." },
  { q: "Do I need to install anything?", a: "No. It works in any web browser. If you prefer an app, install it on Windows or Android from the Download page. Your account and bills are the same on every device." },
  { q: "Can my staff use it?", a: "Yes. As the owner you can create logins for your staff. They can make and send bills. Only the owner can change settings and manage logins." },
  { q: "Who can see my data?", a: "Only the logins of your workshop. Other workshops using Pitstop Plus cannot see your customers, bills or reports." },
  { q: "Does it need internet?", a: "Not all the time. The Windows and Android apps keep working without internet: bills and complaints are saved on the device and sent to your account when the connection is back. Registering, the first sign-in on a device and managing staff logins need internet. The website needs internet." },
  { q: "How do I get help?", a: "Email Skye Automotives at the address at the bottom of this page." },
];

/** Public home page. Signed-in workshops go straight to their dashboard; the apps open at sign-in. */
export default function Home() {
  usePageTitle();
  const { session, loading } = useAuth();
  if (isNativeApp) return <Navigate to="/dashboard" replace />;
  if (!loading && session) return <Navigate to="/dashboard" replace />;

  return (
    <Site>
      <section className="mk-hero">
        <div className="mk-wrap mk-hero-inner">
          <div className="mk-hero-copy">
            <p className="mk-eyebrow">Billing software for vehicle workshops</p>
            <h1>
              Billing for
              <br />
              <span>automobile workshops</span>
            </h1>
            <p className="mk-lead">
              Make a bill in under a minute, send it to the customer on WhatsApp, and look up any vehicle's past work by its number plate. Works in a browser, on Windows and on Android.
            </p>
            <div className="mk-cta">
              <Link to="/register" className="mk-btn mk-btn-primary">
                Register your workshop
              </Link>
              <Link to="/download" className="mk-btn mk-btn-ghost">
                Download the app
              </Link>
            </div>
            <p className="mk-note">Made by Skye Automotives</p>
          </div>
          <HeroMock />
        </div>
      </section>

      <section className="mk-strip">
        <div className="mk-wrap mk-strip-inner">
          <div><strong>Bills</strong> with parts, labour &amp; discounts</div>
          <div><strong>WhatsApp</strong> bills in one tap</div>
          <div><strong>Vehicle history</strong> by number plate</div>
          <div><strong>Reports</strong> for every day and month</div>
        </div>
      </section>

      <section id="features" className="mk-section">
        <div className="mk-wrap">
          <p className="mk-eyebrow">Features</p>
          <h2>What Pitstop Plus does</h2>
          <p className="mk-sub">From the customer's complaint to the final bill, and the sales report at the end of the month.</p>
          <div className="mk-grid">
            {FEATURES.map((f) => (
              <article key={f.title} className="mk-card">
                <div className="mk-icon">
                  <Icon name={f.icon} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="mk-section mk-section-alt">
        <div className="mk-wrap">
          <p className="mk-eyebrow">How it works</p>
          <h2>Getting started</h2>
          <ol className="mk-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="mk-step-num">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-wrap mk-platforms">
          <div>
            <p className="mk-eyebrow">Available everywhere</p>
            <h2>Browser, Windows and Android</h2>
            <p className="mk-sub">Use the counter PC, your phone or a tablet. All of them show the same bills.</p>
            <Link to="/download" className="mk-btn mk-btn-primary">
              Downloads
            </Link>
          </div>
          <div className="mk-platform-list">
            <a className="mk-platform" href={DOWNLOADS.windows}>
              <PlatformIcon kind="windows" />
              <div>
                <strong>Windows</strong>
                <span>Installer · 2 MB</span>
              </div>
            </a>
            <a className="mk-platform" href={DOWNLOADS.android}>
              <PlatformIcon kind="android" />
              <div>
                <strong>Android</strong>
                <span>APK · 4 MB</span>
              </div>
            </a>
            <Link className="mk-platform" to="/login">
              <PlatformIcon kind="web" />
              <div>
                <strong>Web</strong>
                <span>No install needed</span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <section id="faq" className="mk-section mk-section-alt">
        <div className="mk-wrap mk-faq">
          <p className="mk-eyebrow">FAQ</p>
          <h2>Common questions</h2>
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mk-final">
        <div className="mk-wrap">
          <h2>Register your workshop</h2>
          <p>It takes about a minute. We will email you a link to confirm your address.</p>
          <div className="mk-cta mk-cta-center">
            <Link to="/register" className="mk-btn mk-btn-orange">
              Register
            </Link>
            <Link to="/login" className="mk-btn mk-btn-light">
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </Site>
  );
}

export function PlatformIcon({ kind }: { kind: "windows" | "android" | "web" }) {
  if (kind === "windows")
    return (
      <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
        <path fill="#2350d8" d="M3 5.5 10.5 4.5v7H3zM11.5 4.3 21 3v8.5h-9.5zM3 12.5h7.5v7L3 18.5zM11.5 12.5H21V21l-9.5-1.3z" />
      </svg>
    );
  if (kind === "android")
    return (
      <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
        <path fill="#3ddc84" d="M6 9.5h12V18a1.5 1.5 0 0 1-1.5 1.5H15V22h-2v-2.5h-2V22H9v-2.5H7.5A1.5 1.5 0 0 1 6 18zM4 10a1 1 0 0 1 2 0v5a1 1 0 0 1-2 0zM18 10a1 1 0 0 1 2 0v5a1 1 0 0 1-2 0zM6.2 8.5a5.8 5.8 0 0 1 11.6 0zM9.5 6.5a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4zm5 0a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4zM8 3l1.2 2M16 3l-1.2 2" stroke="#3ddc84" strokeWidth=".8" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#f97316" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z" />
    </svg>
  );
}

/** A drawn (not screenshotted) preview of a bill on a laptop and the WhatsApp message on a phone. */
export function HeroMock() {
  return (
    <div className="mk-mock" aria-hidden="true">
      <div className="mk-window">
        <div className="mk-window-bar">
          <i />
          <i />
          <i />
          <span>Bill #128 · Sharma Motors</span>
        </div>
        <div className="mk-bill">
          <div className="mk-bill-head">
            <div>
              <b>Ravi Kumar</b>
              <small>KL 39 W 0890 · 98765 43210</small>
            </div>
            <span className="mk-pill">16 Oct</span>
          </div>
          <div className="mk-bill-row"><span>Engine oil 1.2 L</span><span>₹ 540</span></div>
          <div className="mk-bill-row"><span>Brake pads (front)</span><span>₹ 1,150</span></div>
          <div className="mk-bill-row"><span>Chain lube &amp; adjust</span><span>₹ 150</span></div>
          <div className="mk-bill-row"><span>Labour</span><span>₹ 600</span></div>
          <div className="mk-bill-row mk-muted"><span>Discount 5%</span><span>− ₹ 122</span></div>
          <div className="mk-bill-total"><span>Total</span><span>₹ 2,318</span></div>
          <div className="mk-bill-actions">
            <span className="mk-fake-btn">Print / PDF</span>
            <span className="mk-fake-btn mk-fake-wa">Send on WhatsApp</span>
          </div>
        </div>
      </div>
      <div className="mk-phone">
        <div className="mk-phone-top">WhatsApp</div>
        <div className="mk-bubble">
          <b>Sharma Motors</b>
          <br />
          Bill #128 for KL 39 W 0890
          <br />
          Total: <b>₹ 2,318</b>
          <br />
          Thank you! 🙏
        </div>
      </div>
    </div>
  );
}
