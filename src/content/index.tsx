import { createRoot } from "react-dom/client";
import { Overlay } from "./ui/Overlay";

const HOST_ID = "easy-job-application-host";

// Clicking our floating button dispatches a real event that bubbles out of
// the shadow tree to `document`, retargeted as this host element. Lots of
// ATS modals/dialogs implement "click outside to close" with a bubble-phase
// document listener (`useOutsideClick`/`ClickAwayListener`/etc.) that would
// otherwise see this as a click outside their modal and dismiss it. Content
// scripts run before the user can ever open such a modal, so registering
// this listener now guarantees it runs before any per-modal listener the
// page adds later (same-node, same-phase listeners fire in registration
// order) -- stopImmediatePropagation there keeps the page's listener from
// ever seeing the event, without touching our own click handling, which has
// already run by the time the event bubbles this far up.
function guardOverlayEventsFromPage(host: HTMLElement): void {
  const types = ["pointerdown", "mousedown", "mouseup", "click", "focusin"] as const;
  for (const type of types) {
    document.addEventListener(type, (event) => {
      if (event.composedPath().includes(host)) {
        event.stopImmediatePropagation();
      }
    });
  }
}

function mount() {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  // Reset any inherited page styles on the host itself; everything below it
  // lives inside an isolated shadow tree so the page's CSS can't leak in and
  // our styles can't leak out.
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.zIndex = "2147483647";
  (document.body ?? document.documentElement).appendChild(host);
  guardOverlayEventsFromPage(host);

  const shadow = host.attachShadow({ mode: "open" });
  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);

  createRoot(mountPoint).render(<Overlay />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
