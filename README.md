# Easy Job Application

Chrome extension (Manifest V3) that autofills job-application forms by
extracting a generic, structured description of whatever fields a page
presents and asking the Anthropic API to semantically map your saved profile
onto them. There are no per-site or per-ATS adapters — the same extractor
runs everywhere.

## How it works

1. Click the floating **"Fill this form"** button (bottom-right of any page).
2. The content script scans the page (including open shadow roots and
   same-origin iframes) into a compact `FieldDescriptor[]`.
3. The background service worker sends that plus your profile to the
   Anthropic API and gets back a field → value mapping.
4. High/medium-confidence values are written into the form; low-confidence
   ones are written too but outlined in amber until you look at them.
5. Anything the AI couldn't confidently fill shows up as an inline question.
   Your answer is written to that field immediately and saved to your
   profile, so future forms stop asking.

The extension never submits a form for you, and it can't populate file
(résumé/CV) inputs — browsers don't allow extensions to inject files
programmatically, so those are flagged for you to attach by hand.

## Setup

```sh
pnpm install
pnpm build
```

This produces a `dist/` folder. Load it as an unpacked extension:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `dist/` folder.

Click the extension's toolbar icon to open the settings page, where you:

- Enter your own Anthropic API key (**API Key** tab). The key is stored
  locally in plain text, you're billed directly by Anthropic for your own
  usage, and your profile data is sent to Anthropic on every "Fill this
  form" click — the settings page states this explicitly.
- Fill in at least your basics (**Profile** tab) so there's something for the
  AI to map.

For active development, `pnpm dev` runs Vite with HMR; reload the unpacked
extension in `chrome://extensions` after the first build.

## Manual test plan

1. Open a Greenhouse-hosted job posting (cleanest DOM to start with — not a
   special case in the code, just an easy first target).
2. Click **Fill this form**.
3. Confirm text/select/radio fields populate, low-confidence fields get an
   amber outline, and a question appears for anything unanswerable (e.g. a
   custom EEO question you haven't set a default for).
4. Answer the question — confirm the field fills immediately and the answer
   shows up under **Profile → Learned answers** afterward.
5. Try a messier target (Lever, Workday) to check shadow DOM / iframe
   handling. A form embedded in a **cross-origin** iframe will show up in
   the status message as "could not be reached" — that's a known browser
   limitation (extensions can't reach into cross-origin frames), not a bug.

## Project layout

```
src/
  shared/     types, chrome.storage wrappers for the profile + API key
  background/ service worker: message router + Anthropic API client
  content/    extractor (DOM scan), writer (validated DOM writes), floating UI
  options/    profile editor + API key settings page (React)
```

See inline comments for the non-obvious architectural calls (why there are
no per-site adapters, why the profile store is the only "memory" in the
system, why file inputs can't be automated).
