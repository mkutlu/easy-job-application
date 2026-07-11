import type { FieldDescriptor, FieldType, PageContext } from "../../shared/types";
import { registerElement, registerGroup, resetRegistry } from "../elementRegistry";
import { groupRadiosAndCheckboxes } from "./groups";
import { collectAccessibleDocuments } from "./iframes";
import { extractJobPostingContext } from "./jobPosting";
import { findSectionHeading, findSurroundingText, resolveLabel } from "./labelResolution";
import { walkAllRoots } from "./shadowDom";

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6, legend";
let idCounter = 0;

function normalizeAttr(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

// Excludes page chrome (site-wide search boxes, nav bars) generically via
// standard HTML5/ARIA landmark semantics -- not any per-site selector. Every
// site that marks up its header/nav/search this way (the vast majority) gets
// filtered the same way; a site with a completely unmarked, bespoke search
// widget outside any of these landmarks and not using type="search" won't be
// caught, but that's a much rarer case than the sites that do use them.
const PAGE_CHROME_SELECTOR =
  'header, nav, [role="banner"], [role="navigation"], [role="search"], form[role="search"]';

function isPageChrome(el: Element): boolean {
  if (el instanceof HTMLInputElement && el.type === "search") return true;
  return el.closest(PAGE_CHROME_SELECTOR) !== null;
}

function inputTypeToFieldType(input: HTMLInputElement): FieldType {
  switch (input.type) {
    case "email":
    case "tel":
    case "number":
    case "url":
    case "password":
    case "date":
    case "radio":
    case "checkbox":
    case "file":
      return input.type as FieldType;
    case "hidden":
    case "submit":
    case "button":
    case "reset":
    case "image":
      return "unknown";
    default:
      return "text";
  }
}

function buildDebugSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const parts: string[] = [];
  let node: Element | null = el;
  for (let depth = 0; depth < 5 && node && node.tagName !== "BODY"; depth++) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    const index = Array.from(parent.children).indexOf(node) + 1;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`);
    node = parent;
  }
  return parts.join(" > ") || el.tagName.toLowerCase();
}

function describeSingle(el: HTMLElement, type: FieldType): FieldDescriptor {
  const { label, source } = resolveLabel(el);
  const id = `f${idCounter++}`;
  registerElement(id, el);

  const options =
    el instanceof HTMLSelectElement
      ? Array.from(el.options)
          .map((o) => o.textContent?.trim() ?? "")
          .filter((t) => t.length > 0)
      : [];

  const nameAttr =
    (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).name ??
    el.getAttribute("name");

  return {
    id,
    domSelector: buildDebugSelector(el),
    type,
    label,
    labelSource: source,
    placeholder: normalizeAttr(el.getAttribute("placeholder")),
    name: normalizeAttr(nameAttr),
    autocomplete: normalizeAttr(el.getAttribute("autocomplete")),
    options,
    required:
      (el as HTMLInputElement).required === true ||
      el.getAttribute("aria-required") === "true",
    surroundingText: findSurroundingText(el),
    sectionHeading: findSectionHeading(el),
  };
}

function describeGroup(
  type: "radio" | "checkbox",
  inputs: HTMLInputElement[],
): FieldDescriptor {
  const id = `f${idCounter++}`;
  registerGroup(id, inputs);
  const representative = inputs[0];

  // domWriter matches a mapped value back to its input purely by index
  // (options[i] <-> inputs[i]); this must never drop or reorder entries
  // relative to `inputs`, even when a given radio/checkbox has no resolvable
  // label of its own (common when only the group as a whole has a legend).
  const options = inputs.map((input, index) => {
    const { label } = resolveLabel(input);
    return label ?? normalizeAttr(input.value) ?? `Option ${index + 1}`;
  });

  return {
    id,
    domSelector: buildDebugSelector(representative),
    type,
    // A shared group label (e.g. "Are you legally authorized to work?") is
    // usually the nearest heading/fieldset legend rather than any one
    // input's own label.
    label: findSectionHeading(representative) ?? resolveLabel(representative).label,
    labelSource: "nearestText",
    placeholder: null,
    name: normalizeAttr(representative.name),
    autocomplete: null,
    options,
    required: inputs.some((i) => i.required),
    surroundingText: findSurroundingText(representative),
    sectionHeading: findSectionHeading(representative),
  };
}

function collectHeadings(doc: Document): string[] {
  const headings = Array.from(doc.querySelectorAll(HEADING_SELECTOR))
    .map((h) => h.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter((t) => t.length > 0 && t.length < 200);
  return Array.from(new Set(headings)).slice(0, 20);
}

export interface ScanResult {
  descriptors: FieldDescriptor[];
  pageContext: PageContext;
  crossOriginIframeCount: number;
}

export function scanForFields(): ScanResult {
  resetRegistry();
  idCounter = 0;

  const { documents, crossOriginIframeCount } = collectAccessibleDocuments(document);

  const candidateInputs: HTMLInputElement[] = [];
  const otherControls: HTMLElement[] = [];

  for (const doc of documents) {
    walkAllRoots(doc, (root) => {
      root.querySelectorAll("input").forEach((el) => {
        if (isVisible(el) && !isPageChrome(el)) candidateInputs.push(el as HTMLInputElement);
      });
      root.querySelectorAll("select, textarea").forEach((el) => {
        if (isVisible(el) && !isPageChrome(el)) otherControls.push(el as HTMLElement);
      });
    });
  }

  const { groups, standalone } = groupRadiosAndCheckboxes(candidateInputs);
  const nonRadioCheckboxInputs = candidateInputs.filter(
    (i) => i.type !== "radio" && i.type !== "checkbox",
  );

  const descriptors: FieldDescriptor[] = [];

  for (const input of nonRadioCheckboxInputs) {
    descriptors.push(describeSingle(input, inputTypeToFieldType(input)));
  }
  for (const input of standalone) {
    descriptors.push(describeSingle(input, inputTypeToFieldType(input)));
  }
  for (const control of otherControls) {
    const type: FieldType = control instanceof HTMLSelectElement ? "select" : "textarea";
    descriptors.push(describeSingle(control, type));
  }
  for (const group of groups) {
    descriptors.push(describeGroup(group.type, group.inputs));
  }

  const pageContext: PageContext = {
    url: location.href,
    pageTitle: document.title,
    detectedFormHeadings: collectHeadings(document),
    jobPosting: extractJobPostingContext(),
  };

  return { descriptors, pageContext, crossOriginIframeCount };
}
