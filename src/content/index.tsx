import { createRoot } from "react-dom/client";
import { Overlay } from "./ui/Overlay";

const HOST_ID = "easy-job-application-host";

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
