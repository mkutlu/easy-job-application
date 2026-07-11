import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./options.css";
import { Options } from "./Options";

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <Options />
    </StrictMode>,
  );
}
