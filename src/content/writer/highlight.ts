const REVIEW_ATTR = "data-eja-review";

// high/medium confidence: brief green flash that fades on its own.
export function flashSuccess(el: HTMLElement): void {
  const prevOutline = el.style.outline;
  const prevOffset = el.style.outlineOffset;
  el.style.outline = "2px solid #22c55e";
  el.style.outlineOffset = "2px";
  window.setTimeout(() => {
    el.style.outline = prevOutline;
    el.style.outlineOffset = prevOffset;
  }, 1800);
}

// low confidence: persistent amber outline + tooltip, cleared the moment the
// user actually looks at/edits the field (that's the point of the review).
export function markForReview(el: HTMLElement, message: string): void {
  el.style.outline = "2px solid #f59e0b";
  el.style.outlineOffset = "2px";
  el.title = message;
  el.setAttribute(REVIEW_ATTR, "1");

  const clear = () => {
    el.style.outline = "";
    el.style.outlineOffset = "";
    el.removeAttribute(REVIEW_ATTR);
    el.removeAttribute("title");
  };
  el.addEventListener("input", clear, { once: true });
  el.addEventListener("change", clear, { once: true });
}
