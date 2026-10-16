import { useEffect, useState } from "react";
import { Link } from "react-router";
import { fetchLatestRelease, formatSize, type ReleaseInfo } from "../../lib/downloads";
import { formatDate } from "../../lib/format";
import { PlatformIcon } from "./Home";
import Site, { DOWNLOADS } from "./Site";
import { usePageTitle } from "../../lib/usePageTitle";

/** Public download page: Windows installer, Android APK and the web app. */
export default function Download() {
  usePageTitle("Download");
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  useEffect(() => {
    void fetchLatestRelease().then(setRelease);
  }, []);
  const winSize = formatSize(release?.windowsSize) ?? "about 2 MB";
  const apkSize = formatSize(release?.androidSize) ?? "about 4 MB";

  return (
    <Site>
      <section className="mk-section mk-download">
        <div className="mk-wrap">
          <p className="mk-eyebrow">Download</p>
          <h1 className="mk-h1">Get Pitshop Plus</h1>
          <p className="mk-sub">Use the same account on all your devices.</p>
          {release && (
            <p className="mk-version">
              Latest version <strong>{release.version}</strong>
              {release.published && <> · released {formatDate(release.published.slice(0, 10))}</>}
            </p>
          )}

          <div className="mk-dl-grid">
            <article className="mk-dl">
              <PlatformIcon kind="windows" />
              <h2>Windows</h2>
              <p className="mk-dl-meta">Windows 10 and 11 · 64-bit · {winSize}</p>
              <a className="mk-btn mk-btn-primary mk-btn-block" href={DOWNLOADS.windows}>
                Download for Windows
              </a>
              <ol>
                <li>Open <b>PitshopPlus-Setup.exe</b>.</li>
                <li>
                  If Windows says <i>“Windows protected your PC”</i>, click <b>More info → Run anyway</b>.
                </li>
                <li>Open Pitshop Plus from the Start menu and sign in.</li>
              </ol>
            </article>

            <article className="mk-dl">
              <PlatformIcon kind="android" />
              <h2>Android</h2>
              <p className="mk-dl-meta">Android 7 and newer · {apkSize}</p>
              <a className="mk-btn mk-btn-primary mk-btn-block" href={DOWNLOADS.android}>
                Download for Android
              </a>
              <ol>
                <li>Open this page on your phone and tap the button.</li>
                <li>
                  Open <b>PitshopPlus.apk</b>. If asked, allow <b>Install unknown apps</b> for your browser.
                </li>
                <li>Open Pitshop Plus and sign in.</li>
              </ol>
            </article>

            <article className="mk-dl">
              <PlatformIcon kind="web" />
              <h2>Web</h2>
              <p className="mk-dl-meta">Chrome, Edge, Safari, Firefox · nothing to install</p>
              <Link className="mk-btn mk-btn-orange mk-btn-block" to="/login">
                Open Pitshop Plus
              </Link>
              <ol>
                <li>Works on any computer, tablet or phone.</li>
                <li>Best for printing bills on a shared counter PC.</li>
                <li>
                  New here? <Link to="/register">Register your workshop</Link> first.
                </li>
              </ol>
            </article>
          </div>

          <p className="mk-dl-foot">
            Already installed? The apps tell you when a new version is out, and updating keeps all your data.
          </p>
        </div>
      </section>
    </Site>
  );
}
