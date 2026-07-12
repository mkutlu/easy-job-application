import type { FieldDescriptor } from "../../shared/types";

function normalizeText(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 && trimmed.length < 300 ? trimmed : null;
}

function getRoot(el: Element): Document | ShadowRoot {
  const root = el.getRootNode();
  return root instanceof Document || root instanceof ShadowRoot ? root : document;
}

// Resolution order (most to least reliable), per the field extraction spec:
// explicit <label for> -> wrapping <label> -> aria-label/aria-labelledby ->
// placeholder -> nearest preceding text node/heading.
export function resolveLabel(
  el: HTMLElement,
): { label: string | null; source: FieldDescriptor["labelSource"] } {
  const root = getRoot(el);

  const id = el.getAttribute("id");
  if (id) {
    const forLabel = root.querySelector(`label[for="${CSS.escape(id)}"]`);
    const text = normalizeText(forLabel?.textContent);
    if (text) return { label: text, source: "for" };
  }

  const wrapping = el.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, select, textarea").forEach((n) => n.remove());
    const text = normalizeText(clone.textContent);
    if (text) return { label: text, source: "wrapping" };
  }

  const ariaLabel = normalizeText(el.getAttribute("aria-label"));
  if (ariaLabel) return { label: ariaLabel, source: "aria-label" };

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = normalizeText(
      labelledBy
        .split(/\s+/)
        .map((refId) => root.getElementById(refId)?.textContent ?? "")
        .join(" "),
    );
    if (text) return { label: text, source: "aria-labelledby" };
  }

  const placeholder = normalizeText(el.getAttribute("placeholder"));
  if (placeholder) return { label: placeholder, source: "placeholder" };

  const nearest = findNearestPrecedingText(el);
  if (nearest) return { label: nearest, source: "nearestText" };

  return { label: null, source: "none" };
}

function findNearestPrecedingText(el: Element): string | null {
  let node: Element | null = el;
  for (let depth = 0; depth < 5 && node; depth++) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      const text = normalizeText(sibling.textContent);
      if (text) return text;
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement;
  }
  return null;
}

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6, legend, [role='heading']";

// Many custom-built modals (an "Add work experience" dialog reopened once
// per entry is the common case that motivates this) don't mark their title
// up as a real heading tag -- it's just a styled div -- so the generic
// ancestor-heading walk below finds nothing for any field inside them. The
// ARIA dialog contract (role="dialog"/"alertdialog" or aria-modal="true",
// with aria-labelledby/aria-label naming the dialog) is a standardized,
// widely-implemented alternative that doesn't depend on visual markup, so
// it's checked first and is generic across sites, not specific to any one.
function findAccessibleDialogTitle(el: Element): string | null {
  const dialog = el.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]');
  if (!dialog) return null;

  const labelledBy = dialog.getAttribute("aria-labelledby");
  if (labelledBy) {
    const root = getRoot(dialog);
    const text = normalizeText(
      labelledBy
        .split(/\s+/)
        .map((refId) => root.getElementById(refId)?.textContent ?? "")
        .join(" "),
    );
    if (text) return text;
  }

  return normalizeText(dialog.getAttribute("aria-label"));
}

// Nearest enclosing section/fieldset heading, used to disambiguate
// repeated field groups (e.g. multiple "Start Date" fields across several
// work-experience entries).
export function findSectionHeading(el: Element): string | null {
  const dialogTitle = findAccessibleDialogTitle(el);
  if (dialogTitle) return dialogTitle;

  const container = el.closest("fieldset, section, [role='group']");
  if (container) {
    const legend = container.querySelector(":scope > legend, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6");
    const text = normalizeText(legend?.textContent);
    if (text) return text;
  }
  // Walk backwards through preceding siblings/ancestors for the nearest heading.
  let node: Element | null = el;
  for (let depth = 0; depth < 8 && node; depth++) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (sibling.matches(HEADING_SELECTOR)) {
        const text = normalizeText(sibling.textContent);
        if (text) return text;
      }
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement;
  }
  return null;
}

export function findSurroundingText(el: Element): string | null {
  const parent = el.parentElement;
  if (!parent) return null;
  const text = normalizeText(parent.textContent);
  if (!text) return null;
  return text.length <= 200 ? text : null;
}
