import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "Easy Job Application",
  description:
    "Autofills job application forms by semantically mapping your saved profile onto whatever fields a page presents, using an AI model at runtime instead of per-site adapters.",
  version: pkg.version,
  icons: {
    16: "public/icons/icon16.png",
    32: "public/icons/icon32.png",
    48: "public/icons/icon48.png",
    128: "public/icons/icon128.png",
  },
  action: {
    default_icon: {
      16: "public/icons/icon16.png",
      32: "public/icons/icon32.png",
      48: "public/icons/icon48.png",
      128: "public/icons/icon128.png",
    },
  },
  options_page: "src/options/options.html",
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      // Only the top frame runs the content script (all_frames defaults to
      // false). Same-origin iframes are reached by walking into their
      // contentDocument directly (same JS realm -- no message passing
      // needed); cross-origin iframes throw/return null on that access and
      // are flagged as a known, unfillable limitation instead of injecting a
      // separate script instance (and a separate floating button) into
      // every ad/tracking iframe on the page.
      matches: ["<all_urls>"],
      js: ["src/content/index.tsx"],
      run_at: "document_idle",
    },
  ],
  permissions: ["storage"],
  host_permissions: ["https://api.anthropic.com/*"],
});
