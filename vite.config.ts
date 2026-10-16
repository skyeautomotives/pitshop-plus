import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// BASE_PATH lets the app be served from a sub-path (e.g. GitHub Pages /repo-name/).
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || "/",
  // The app's own version, for the "update available" check in the Windows and Android apps.
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(version) },
});
