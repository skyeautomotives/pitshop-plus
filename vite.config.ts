import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// BASE_PATH lets the app be served from a sub-path (e.g. GitHub Pages /repo-name/).
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || "/",
});
