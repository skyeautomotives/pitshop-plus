import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyDisplay } from "./lib/display";
import "./styles.css";

applyDisplay();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
