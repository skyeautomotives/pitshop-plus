import { Link } from "react-router";
import { usePageTitle } from "../../lib/usePageTitle";
import Site, { CONTACT_EMAIL } from "./Site";

const UPDATED = "16 October 2026";

/** Public Privacy Policy page. */
export default function Privacy() {
  usePageTitle("Privacy Policy");
  return (
    <Site>
      <section className="mk-section">
        <div className="mk-wrap mk-legal">
          <p className="mk-eyebrow">Legal</p>
          <h1 className="mk-h1">Privacy Policy</h1>
          <p className="mk-legal-updated">Last updated {UPDATED}</p>

          <p>
            This policy explains what information Pitstop Plus (the website, the Windows app and the Android app) keeps,
            why, and who can see it. Pitstop Plus is provided by Skye Automotives ("we", "us"). Questions:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <h2>1. What we keep</h2>
          <ul>
            <li>
              <strong>Your account:</strong> the workshop's name, address and phone number, and for each login the
              person's name, email address, username and role (owner or staff).
            </li>
            <li>
              <strong>Your workshop's records:</strong> the bills, complaints and vehicle history you enter, including
              your customers' names, phone numbers, addresses and vehicle numbers.
            </li>
            <li>
              <strong>Subscription:</strong> your plan, and the payments you make to us (amount, date, method and
              reference). We don't keep card or bank account numbers.
            </li>
            <li>
              <strong>Sign-in and usage:</strong> when logins sign in, and how many bills and complaints a workshop has
              made, so we can run the service and help with problems.
            </li>
          </ul>

          <h2>2. Why we keep it</h2>
          <ul>
            <li>To run Pitstop Plus for you: sign-in, saving and showing your records, printing and sharing bills.</li>
            <li>To send emails you need, such as confirming your email address and resetting a password.</li>
            <li>To manage your free trial, plan and payments.</li>
            <li>To keep the service secure and working, and to help when you contact us.</li>
          </ul>
          <p>We don't sell your information, and we don't use your customers' details for advertising or contact them.</p>

          <h2>3. Who can see it</h2>
          <ul>
            <li>
              Your workshop's records can be seen only by the logins of your workshop. Each workshop's records are kept
              separate from every other workshop's.
            </li>
            <li>
              Skye Automotives staff can see your account details, your subscription and how many bills and
              complaints your workshop has made. They don't see your customers' details or the amounts on your bills,
              except when you ask us for help with a record, or when the law requires it.
            </li>
            <li>
              We use service providers that host and run parts of Pitstop Plus for us, such as Supabase (database and
              sign-in) and Google (email and file storage). They may only use the information to provide their service
              to us.
            </li>
            <li>We may share information when the law requires it, for example on a valid request from the authorities.</li>
          </ul>

          <h2>4. Your customers' information</h2>
          <p>
            Your workshop decides what customer information to record and is responsible for it. We store and process
            it on your behalf, only to run Pitstop Plus for you. If one of your customers asks us about their
            information, we will refer them to you and help you respond.
          </p>

          <h2>5. On your devices</h2>
          <p>
            The Windows and Android apps, and the website, keep a copy of your workshop's records on the device so
            Pitstop Plus works without an internet connection. Backup files you save are kept wherever you choose, such
            as your own Google Drive. Keep your devices and backup files secure, and remove Pitstop Plus from a device
            you no longer use.
          </p>

          <h2>6. How long we keep it</h2>
          <p>
            We keep your information while your workshop uses Pitstop Plus. When a workshop is closed, we delete its
            records; copies held by our service providers for security are removed on their normal schedule. We may keep
            payment records for as long as the law requires.
          </p>

          <h2>7. Security</h2>
          <p>
            Information is sent over encrypted connections, access is limited to the logins of each workshop, and our
            own access is limited and recorded. No system is perfectly secure, so please use strong passwords, keep
            them private and save your own backups (see the <Link to="/terms">Terms &amp; Conditions</Link>).
          </p>

          <h2>8. Your choices and rights</h2>
          <ul>
            <li>You can see and correct your workshop's details and records in Pitstop Plus.</li>
            <li>The owner can save a full copy of the workshop's records at any time (Settings, Backup &amp; restore).</li>
            <li>
              You can ask us to correct or delete your information, or to close your workshop, by emailing{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We may need to keep some records where the law
              requires it.
            </li>
          </ul>

          <h2>9. Children</h2>
          <p>Pitstop Plus is for businesses and is not meant for anyone under 18.</p>

          <h2>10. Changes</h2>
          <p>
            We may update this policy. The date at the top shows the latest version, and we will let you know about
            important changes.
          </p>

          <h2>11. Contact</h2>
          <p>
            Skye Automotives, <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. This policy is governed by the
            laws of India, including the Digital Personal Data Protection Act, 2023.
          </p>
        </div>
      </section>
    </Site>
  );
}
