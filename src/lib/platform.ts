// Which build is running: the website, the Windows app (Tauri) or the Android app (Capacitor).
// Set at build time with `vite build --mode desktop` / `--mode android`.

export const isDesktopApp = import.meta.env.MODE === "desktop";
export const isAndroidApp = import.meta.env.MODE === "android";
export const isNativeApp = isDesktopApp || isAndroidApp;

/** Android's WebView has no print dialog; the website and Windows app do. */
export const canPrint = !isAndroidApp;

/**
 * Opens a link outside the app (e.g. WhatsApp). In the apps a plain link would
 * try to load the page inside the app window, so hand it to the system instead.
 */
export async function openExternal(url: string): Promise<void> {
  if (isDesktopApp) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else if (isAndroidApp) {
    const { AppLauncher } = await import("@capacitor/app-launcher");
    await AppLauncher.openUrl({ url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** The public website, used for links in emails (the apps can't receive them). */
export const SITE_URL: string = import.meta.env.VITE_SITE_URL || "https://skyeautomotives.github.io/pitshop-plus/";

/** Where email links (confirm email, reset password) should land. */
export function authRedirectUrl(): string {
  return isNativeApp ? SITE_URL : window.location.origin + import.meta.env.BASE_URL;
}
