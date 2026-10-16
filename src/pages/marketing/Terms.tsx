import { Link } from "react-router";
import { usePageTitle } from "../../lib/usePageTitle";
import Site, { CONTACT_EMAIL } from "./Site";

/** Bump when the terms change; stored with each new registration. */
export const TERMS_VERSION = "2026-10-16";
const UPDATED = "16 October 2026";

/** Public Terms & Conditions page. */
export default function Terms() {
  usePageTitle("Terms & Conditions");
  return (
    <Site>
      <section className="mk-section">
        <div className="mk-wrap mk-legal">
          <p className="mk-eyebrow">Legal</p>
          <h1 className="mk-h1">Terms &amp; Conditions</h1>
          <p className="mk-legal-updated">Last updated {UPDATED}</p>

          <p>
            These terms apply to Pitshop Plus (the website, the Windows app and the Android app), provided by Skye
            Automotives ("we", "us"). By registering a workshop or using Pitshop Plus, you ("you", the workshop owner)
            agree to them. If you don't agree, please don't use Pitshop Plus.
          </p>

          <h2>1. The service</h2>
          <p>
            Pitshop Plus lets your workshop make bills, record complaints, keep vehicle history and see reports. We may
            improve, change or remove features over time. We will tell you in advance about changes that take away
            something important you rely on.
          </p>

          <h2>2. Your account and logins</h2>
          <ul>
            <li>The person who registers the workshop is its owner and is responsible for every login they add.</li>
            <li>Keep passwords private. You are responsible for what is done with your workshop's logins.</li>
            <li>Tell us straight away at {CONTACT_EMAIL} if you think someone has used a login without permission.</li>
            <li>The details you give when registering must be true and kept up to date.</li>
          </ul>

          <h2>3. Free trial, plans and payment</h2>
          <ul>
            <li>New workshops get a free trial. We tell you before it ends.</li>
            <li>After the trial, using Pitshop Plus needs a paid plan. Prices are agreed with you before you pay.</li>
            <li>Payments cover the period agreed when you pay. Payments already made are not refunded, except where the law requires it.</li>
            <li>If a payment is overdue, we may limit or suspend your workshop's access until it is paid.</li>
          </ul>

          <h2>4. Your records and backups</h2>
          <p className="mk-legal-key">
            You are responsible for keeping your own backups of your workshop's records.
          </p>
          <ul>
            <li>
              Your bills, complaints and other records belong to you. Pitshop Plus gives you a way to save a backup file of
              them (Settings, Backup &amp; restore), which you can keep in your own Google Drive, on your computer or on
              your phone.
            </li>
            <li>
              Save a backup regularly, at least once a week, and keep it somewhere safe outside Pitshop Plus. Check that
              you can open it.
            </li>
            <li>
              Records can be lost or damaged, for example through a technical fault, a failure of a service we depend on,
              a mistake made with your logins, or a device that is lost or reset. We do not promise that records can be
              recovered.
            </li>
            <li>
              If records are lost, you can bring them back from your own backup files using Restore. We are not
              responsible for records that you have not backed up yourself.
            </li>
            <li>
              Records saved while a device is offline are only on that device until it reconnects and syncs. Don't
              uninstall the app or clear its data while changes are waiting to be sent.
            </li>
          </ul>

          <h2>5. Your customers' information</h2>
          <ul>
            <li>
              You decide what customer information (names, phone numbers, addresses, vehicle numbers) to record, and you
              are responsible for having your customers' permission and for following the law when you collect and use it.
            </li>
            <li>
              We store this information to run Pitshop Plus for you. We do not sell it and do not look at it, except
              when you ask us for help, to keep the service secure and working, or when the law requires it.
            </li>
            <li>
              How we handle information is explained in our <Link to="/privacy">Privacy Policy</Link>.
            </li>
            <li>
              Messages you send to customers (for example on WhatsApp) are sent by you, from your own phone or account.
            </li>
          </ul>

          <h2>6. Acceptable use</h2>
          <p>Don't use Pitshop Plus to break the law, to send spam, or to try to get into another workshop's records or disrupt the service.</p>

          <h2>7. Availability</h2>
          <p>
            We work to keep Pitshop Plus available and working correctly, but it is provided "as is" and "as available".
            It may sometimes be unavailable, for example for maintenance or because of problems with the internet or
            services we depend on. Check bills before you hand them to customers.
          </p>

          <h2>8. Limit of our responsibility</h2>
          <ul>
            <li>
              To the extent the law allows, we are not responsible for any loss of records, loss of business, profit or
              income, or any indirect loss arising from your use of Pitshop Plus or from it being unavailable.
            </li>
            <li>
              To the extent the law allows, our total responsibility to you is limited to the amount you paid us for
              Pitshop Plus in the three months before the problem happened.
            </li>
          </ul>

          <h2>9. Ending the service</h2>
          <ul>
            <li>You can stop using Pitshop Plus at any time. Save a backup of your records first.</li>
            <li>
              We may suspend or close a workshop that breaks these terms or does not pay. Where we can, we will tell you
              first so you can save a backup.
            </li>
            <li>After a workshop is closed, its records may be deleted.</li>
          </ul>

          <h2>10. Changes to these terms</h2>
          <p>
            We may update these terms. We will show the date of the latest version on this page and let you know about
            important changes. Using Pitshop Plus after a change means you accept the updated terms.
          </p>

          <h2>11. Law</h2>
          <p>These terms are governed by the laws of India.</p>

          <h2>12. Contact</h2>
          <p>
            Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
          <p>
            <Link to="/register">Register your workshop</Link>
          </p>
        </div>
      </section>
    </Site>
  );
}
